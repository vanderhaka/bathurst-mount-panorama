import type { CarSoundProfile } from '@/audio/dsp/engine-profile';
import type { NodeBag } from '@/audio/graph/node-bag';
import type { NoiseSet } from '@/audio/graph/noise-set';

/** Shared construction context handed to every layer. */
export interface LayerEnv {
  ctx: BaseAudioContext;
  bag: NodeBag;
  noise: NoiseSet;
  profile: CarSoundProfile;
}

/** Replace NaN / Infinity so an AudioParam call can never throw. */
export function finite(x: number, fallback = 0): number {
  return Number.isFinite(x) ? x : fallback;
}

/** Smooth approach to `value` (exponential, time constant `tc` seconds). */
export function ramp(param: AudioParam, value: number, t: number, tc = 0.03): void {
  param.setTargetAtTime(finite(value), t, tc);
}

/** Jump a param to `value` now, discarding queued automation. */
export function setNow(param: AudioParam, value: number, t: number): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(finite(value), t);
}

export function gain(env: LayerEnv, value: number, out?: AudioNode | AudioParam): GainNode {
  const g = env.bag.add(env.ctx.createGain());
  g.gain.value = value;
  if (out instanceof AudioParam) g.connect(out);
  else if (out) g.connect(out);
  return g;
}

export function filter(
  env: LayerEnv,
  type: BiquadFilterType,
  hz: number,
  q = 0.7,
  gainDb = 0,
): BiquadFilterNode {
  const f = env.bag.add(env.ctx.createBiquadFilter());
  f.type = type;
  f.frequency.value = hz;
  f.Q.value = q;
  f.gain.value = gainDb;
  return f;
}

/** Looping buffer source, started immediately at a random-ish offset. */
export function loop(env: LayerEnv, buffer: AudioBuffer, offsetSec = 0): AudioBufferSourceNode {
  const s = env.bag.add(env.ctx.createBufferSource());
  s.buffer = buffer;
  s.loop = true;
  s.start(0, offsetSec % Math.max(buffer.duration, 0.001));
  return s;
}

export function oscillator(env: LayerEnv, hz: number, type: OscillatorType = 'sine'): OscillatorNode {
  const o = env.bag.add(env.ctx.createOscillator());
  o.type = type;
  o.frequency.value = hz;
  o.start();
  return o;
}

/** Sawtooth-ish periodic wave (1/h harmonics) for ramp pulses. */
export function sawWave(ctx: BaseAudioContext, harmonics = 32): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let h = 1; h <= harmonics; h++) imag[h] = 1 / h;
  return ctx.createPeriodicWave(real, imag);
}

/** Half-wave rectifier: turns a bipolar oscillator into 0..1 pulses (for amplitude modulation). */
export function halfWaveCurve(): Float32Array<ArrayBuffer> {
  const n = 257;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.max(0, (i - 128) / 128);
  return c;
}

/** Soft ceiling: transparent below 0.6, rounded knee to a hard maximum of ~0.9. */
export function ceilingCurve(): Float32Array<ArrayBuffer> {
  const n = 4097;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a < 0.6 ? a : 0.6 + 0.38 * Math.tanh((a - 0.6) / 0.38);
    c[i] = Math.sign(x) * y;
  }
  return c;
}
