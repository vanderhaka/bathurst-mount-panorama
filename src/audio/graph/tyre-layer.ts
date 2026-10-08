import { tyreScrubGain } from '@/audio/dsp/tyre-scrub';
import { roadRoarGain, squealGain, squealPitch, type LayerMix } from '@/audio/dsp/mix-maps';
import { filter, gain, loop, oscillator, ramp, type LayerEnv } from '@/audio/graph/audio-utils';
import type { Layer } from '@/audio/graph/layer';
import type { CarAudioFrame } from '@/types/audio';

/** Narrow resonant peaks: filtered noise with high Q reads as a tonal scream. */
const SQUEAL_BANDS = [
  { hz: 820, q: 22, g: 1.0 },
  { hz: 1340, q: 26, g: 0.8 },
  { hz: 2150, q: 30, g: 0.5 },
] as const;
const SQUEAL_LEVEL = 9;
const HISS_LEVEL = 0.1;
const ROAR_LEVEL = 0.2;

/** Loaded rubber scrub, full-slide squeal and the steady road roar on asphalt. */
export class TyreLayer implements Layer {
  private readonly squeal: GainNode;
  private readonly hiss: GainNode;
  private readonly roar: GainNode;
  private readonly scrub: GainNode;
  private readonly bands: BiquadFilterNode[] = [];

  constructor(env: LayerEnv, out: AudioNode) {
    const white = loop(env, env.noise.white, 0.3);
    const pink = loop(env, env.noise.pink, 0.9);
    this.squeal = gain(env, 0, out);
    this.hiss = gain(env, 0, out);
    this.roar = gain(env, 0, out);
    this.scrub = gain(env, 0, out);
    // Slow wobble on the resonances so the scream is never perfectly static.
    const lfo = oscillator(env, 6.3);
    for (const b of SQUEAL_BANDS) {
      const bp = filter(env, 'bandpass', b.hz, b.q);
      white.connect(bp);
      bp.connect(gain(env, b.g * SQUEAL_LEVEL, this.squeal));
      lfo.connect(gain(env, b.hz * 0.03, bp.frequency));
      this.bands.push(bp);
    }
    white.connect(filter(env, 'highpass', 3000)).connect(this.hiss);
    pink.connect(filter(env, 'bandpass', 450, 0.7)).connect(this.roar);
    pink.connect(filter(env, 'bandpass', 680, 0.9)).connect(this.scrub);
  }

  update(frame: CarAudioFrame, t: number, mix: LayerMix): void {
    const sq = squealGain(frame.slip, frame.speedKmh) * mix.tyre;
    ramp(this.scrub.gain, tyreScrubGain(frame.scrub ?? 0, frame.speedKmh) * mix.tyre, t, 0.05);
    ramp(this.squeal.gain, sq, t, 0.035);
    ramp(this.hiss.gain, sq * HISS_LEVEL, t, 0.05);
    ramp(this.roar.gain, roadRoarGain(frame.speedKmh) * ROAR_LEVEL * mix.tyre, t, 0.08);
    const pitch = squealPitch(frame.slip, frame.speedKmh);
    this.bands.forEach((bp, i) => ramp(bp.frequency, SQUEAL_BANDS[i].hz * pitch, t, 0.08));
  }
}
