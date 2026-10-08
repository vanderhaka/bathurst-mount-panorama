import { CAR_SPECS } from '@/car/car-specs';
import { gearWhineHz, whineGain, type LayerMix } from '@/audio/dsp/mix-maps';
import {
  filter,
  gain,
  halfWaveCurve,
  loop,
  oscillator,
  ramp,
  sawWave,
  type LayerEnv,
} from '@/audio/graph/audio-utils';
import type { Layer } from '@/audio/graph/layer';
import type { CarAudioFrame } from '@/types/audio';

const MAX_WHINE_HZ = 9000;
/** Whine gain time constants (s): a fast drop for the shift cut, a slower return to the steady level. */
const DIP_TC = 0.004;
const RETURN_TC = 0.03;

/**
 * Drivetrain tones: straight-cut gearbox whine (input gear pair tracks engine
 * speed, final-drive pinion tracks road speed) and valvetrain clatter (pushrod:
 * low-mid lifter tick, DOHC: high chain/cam whirr). Dominant in the cockpit.
 */
export class MechanicalLayer implements Layer {
  private readonly whine: GainNode;
  private readonly inputOsc: OscillatorNode;
  private readonly pinionOsc: OscillatorNode;
  private readonly valveGain: GainNode;
  private readonly valveOsc: OscillatorNode;
  private dipUntil = 0;
  /** Steady (no shift) whine gain from the latest update(): what a dropout returns to. */
  private level = 0;

  constructor(
    private readonly env: LayerEnv,
    out: AudioNode,
  ) {
    const mech = env.profile.mechanical;
    this.whine = gain(env, 0, out);
    this.inputOsc = this.whineOsc(0.55);
    this.pinionOsc = this.whineOsc(0.7);

    const rect = env.bag.add(env.ctx.createWaveShaper());
    rect.curve = halfWaveCurve();
    this.valveOsc = oscillator(env, 50);
    this.valveOsc.setPeriodicWave(sawWave(env.ctx, 16));
    this.valveOsc.connect(rect);
    this.valveGain = gain(env, 0, out);
    const ticks = gain(env, 0, this.valveGain);
    rect.connect(ticks.gain);
    loop(env, env.noise.white, 0.5).connect(filter(env, 'bandpass', mech.valvetrainHz, 1.2)).connect(ticks);
  }

  private whineOsc(level: number): OscillatorNode {
    const osc = oscillator(this.env, 400);
    const real = new Float32Array([0, 0, 0, 0]);
    osc.setPeriodicWave(this.env.ctx.createPeriodicWave(real, new Float32Array([0, 1, 0.35, 0.15])));
    osc.connect(gain(this.env, level, this.whine));
    return osc;
  }

  /**
   * Brief gearbox torque interruption: whine drops out for the shift. The shift is detected after this
   * frame's update() has already set the whine to full gain, so the dropout is scheduled here, at the
   * shift's own audio time (an event added later at the same time wins), and so is its return at
   * `t + seconds`. Waiting for the next update() would start it a frame late and end it a frame late.
   */
  dip(t: number, seconds: number): void {
    // A shift inside an unfinished dropout extends it: hold the earlier return at zero.
    if (t < this.dipUntil) ramp(this.whine.gain, 0, this.dipUntil, DIP_TC);
    this.dipUntil = t + seconds;
    ramp(this.whine.gain, 0, t, DIP_TC);
    ramp(this.whine.gain, this.level, this.dipUntil, RETURN_TC);
  }

  update(frame: CarAudioFrame, t: number, mix: LayerMix): void {
    const spec = CAR_SPECS[this.env.profile.kind];
    const m = this.env.profile.mechanical;
    const f = gearWhineHz(frame.rpm, frame.speedKmh, spec.dimensions.wheelRadius, spec.finalDrive, m.inputTeeth, m.pinionTeeth);
    ramp(this.inputOsc.frequency, Math.min(f.inputHz, MAX_WHINE_HZ), t, 0.02);
    ramp(this.pinionOsc.frequency, Math.min(f.pinionHz, MAX_WHINE_HZ), t, 0.02);
    this.level = whineGain(frame.gear, frame.load) * m.whineGain * mix.mechanical;
    if (t < this.dipUntil) {
      ramp(this.whine.gain, 0, t, DIP_TC);
      ramp(this.whine.gain, this.level, this.dipUntil, RETURN_TC); // the return follows the latest level
    } else {
      ramp(this.whine.gain, this.level, t, RETURN_TC);
    }
    const cam = (frame.rpm / 60) * m.valvetrainOrder;
    ramp(this.valveOsc.frequency, Math.max(1, cam), t, 0.03);
    ramp(this.valveGain.gain, m.valvetrainGain * 20 * mix.mechanical * Math.min(1, frame.rpm / 4000), t, 0.05);
  }
}
