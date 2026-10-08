import workletUrl from './engine-processor.ts?worker&url';
import { buildFiringSlots } from '@/audio/dsp/firing';
import { lerp, lerpLog } from '@/audio/dsp/math';
import {
  buildPulseTable,
  patternHarmonics,
  renderPatternCycle,
} from '@/audio/dsp/pulse-shape';
import { ENGINE_PROCESSOR_NAME, ENGINE_STOP, ENGINE_STOPPED } from '@/audio/engine-constants';
import { filter, finite, gain, loop, oscillator, ramp, setNow, type LayerEnv } from '@/audio/graph/audio-utils';

export interface EngineControls {
  rpm: number;
  /** 0..1 engine load. */
  load: number;
  throttle: number;
  limiter: boolean;
}

/** The synthesised engine: an exhaust stream and an induction stream, both mono. */
export interface EngineSource {
  readonly mode: 'worklet' | 'fallback';
  readonly exhaust: AudioNode;
  readonly intake: AudioNode;
  snap(c: EngineControls, t: number): void;
  setControls(c: EngineControls, t: number): void;
  /** Ignition cut (gear shift) for `seconds`. */
  cut(t: number, seconds: number): void;
  /** Ends the engine for good; settles once it has (the context must run for a worklet to end). */
  stop(): Promise<void>;
}

/** How long stop() waits for the worklet to confirm before giving up (a context that will not run). */
export const ENGINE_STOP_TIMEOUT_MS = 1000;

/** Primary path: the sample-accurate pulse-train synthesiser in an AudioWorklet. */
export async function createWorkletEngine(env: LayerEnv): Promise<EngineSource> {
  await env.ctx.audioWorklet.addModule(workletUrl);
  const node = env.bag.add(
    new AudioWorkletNode(env.ctx, ENGINE_PROCESSOR_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 2,
      outputChannelCount: [1, 1],
      processorOptions: { profile: env.profile },
    }),
  );
  const exhaust = gain(env, 1);
  const intake = gain(env, 1);
  node.connect(exhaust, 0, 0);
  node.connect(intake, 1, 0);
  const p = (name: string): AudioParam => {
    const param = node.parameters.get(name);
    if (!param) throw new Error(`engine worklet missing param ${name}`);
    return param;
  };
  const rpm = p('rpm');
  const load = p('load');
  const throttle = p('throttle');
  const limiter = p('limiter');
  const cutParam = p('cut');
  return {
    mode: 'worklet',
    exhaust,
    intake,
    snap(c, t) {
      setNow(rpm, c.rpm, t);
      setNow(load, c.load, t);
      setNow(throttle, c.throttle, t);
      setNow(limiter, c.limiter ? 1 : 0, t);
    },
    setControls(c, t) {
      ramp(rpm, c.rpm, t, 0.02);
      ramp(load, c.load, t, 0.035);
      ramp(throttle, c.throttle, t, 0.03);
      ramp(limiter, c.limiter ? 1 : 0, t, 0.005);
    },
    cut(t, seconds) {
      cutParam.cancelScheduledValues(t);
      cutParam.setValueAtTime(1, t);
      cutParam.setValueAtTime(0, t + seconds);
    },
    stop() {
      return new Promise<void>((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          node.port.close();
          resolve();
        };
        const timer = setTimeout(done, ENGINE_STOP_TIMEOUT_MS);
        node.port.onmessage = (e: MessageEvent) => { if (e.data === ENGINE_STOPPED) done(); };
        node.port.postMessage(ENGINE_STOP);
      });
    },
  };
}

function tanhCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1025;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(drive * ((i / (n - 1)) * 2 - 1));
  return c;
}

/**
 * Fallback when AudioWorklet is unavailable: one oscillator playing the whole
 * 8-pulse cross-plane cycle as a PeriodicWave (frequency = rpm / 120), shaped by
 * a load-dependent low-pass, body resonances and a waveshaper. Intake is
 * band-passed noise amplitude-modulated at the firing frequency.
 */
export function createFallbackEngine(env: LayerEnv): EngineSource {
  const { ctx, profile } = env;
  const cycle = renderPatternCycle({
    slots: buildFiringSlots(profile.layout),
    cylinderGain: profile.cylinderGain,
    gapGain: profile.gapGain,
    pulse: buildPulseTable(profile.pulseAttackSlots, profile.pulseDecaySlots),
  });
  const h = patternHarmonics(cycle, 48);
  const osc = oscillator(env, profile.idleRpm / 120);
  osc.setPeriodicWave(ctx.createPeriodicWave(h.real, h.imag));

  const lp = filter(env, 'lowpass', profile.brightHz.full, 0.7);
  const shaper = env.bag.add(ctx.createWaveShaper());
  shaper.curve = tanhCurve(profile.drive.full);
  const level = gain(env, 0);
  const gate = gain(env, 1);
  const exhaust = gain(env, 1);
  osc.connect(gain(env, 0.9)).connect(lp);
  let node: AudioNode = lp;
  for (const f of profile.formants.slice(0, 3)) {
    const pk = filter(env, 'peaking', f.hz, f.q, 5 * f.gain);
    node.connect(pk);
    node = pk;
  }
  node.connect(shaper);
  shaper.connect(level);
  level.connect(gate);
  gate.connect(exhaust);

  // 13 Hz square gate that stutters the output while the limiter is cutting.
  const limOsc = oscillator(env, 13, 'square');
  const limDepth = gain(env, 0, gate.gain);
  limOsc.connect(limDepth);

  const noiseBp = filter(env, 'bandpass', profile.intake.noiseHzLow, profile.intake.noiseQ);
  const am = gain(env, 1 - profile.intake.modDepth * 0.5);
  const intakeLevel = gain(env, 0);
  const amLfo = oscillator(env, profile.idleRpm / 15);
  amLfo.connect(gain(env, profile.intake.modDepth * 0.5, am.gain));
  loop(env, env.noise.white, 0.8).connect(noiseBp).connect(am).connect(intakeLevel);
  const intake = gain(env, 1);
  intakeLevel.connect(intake);

  let cutUntil = 0;
  const apply = (c: EngineControls, t: number, tc: number): void => {
    const rpmNorm = Math.min(1, Math.max(0, finite(c.rpm) / 7500));
    const load = Math.min(1, Math.max(0, finite(c.load)));
    const thr = Math.min(1, Math.max(0, finite(c.throttle)));
    ramp(osc.frequency, Math.max(1, finite(c.rpm) / 120), t, tc);
    ramp(lp.frequency, lerp(profile.brightHz.overrun, profile.brightHz.full, Math.pow(load, 0.8)) * (0.85 + 0.3 * rpmNorm), t, 0.04);
    const lvl = t < cutUntil ? 0 : profile.exhaustLevel * (0.55 + 0.45 * rpmNorm) * (0.22 + 0.78 * Math.pow(load, 0.9)) * 0.9;
    ramp(level.gain, lvl, t, t < cutUntil ? 0.004 : 0.03);
    ramp(limDepth.gain, c.limiter ? 0.4 : 0, t, 0.01);
    ramp(noiseBp.frequency, lerpLog(profile.intake.noiseHzLow, profile.intake.noiseHzHigh, rpmNorm), t, 0.05);
    ramp(amLfo.frequency, Math.max(1, finite(c.rpm) / 15), t, tc);
    const il = (0.03 + Math.pow(rpmNorm, 1.25)) * (0.12 + 0.88 * thr) * profile.intake.level * profile.intake.noiseGain * 0.45;
    ramp(intakeLevel.gain, il, t, 0.04);
  };
  return {
    mode: 'fallback',
    exhaust,
    intake,
    snap(c, t) {
      apply(c, t, 0.001);
      setNow(osc.frequency, Math.max(1, c.rpm / 120), t);
    },
    setControls: (c, t) => apply(c, t, 0.02),
    cut(t, seconds) {
      cutUntil = t + seconds;
    },
    stop: () => Promise.resolve(), // its sources are stopped with the rest of the node bag
  };
}

export interface EngineFactoryResult {
  engine: EngineSource;
  /** Reason the worklet path was not used, when it was not. */
  workletError?: string;
}

/** Try the AudioWorklet engine; fall back to oscillators if it cannot load. */
export async function createEngineSource(env: LayerEnv, forceFallback = false): Promise<EngineFactoryResult> {
  if (!forceFallback && typeof AudioWorkletNode !== 'undefined' && env.ctx.audioWorklet) {
    try {
      return { engine: await createWorkletEngine(env) };
    } catch (err) {
      return { engine: createFallbackEngine(env), workletError: String(err) };
    }
  }
  return { engine: createFallbackEngine(env), workletError: forceFallback ? 'forced' : 'AudioWorklet unavailable' };
}
