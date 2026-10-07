import { windCutoffHz, windGain, type LayerMix } from '@/audio/dsp/mix-maps';
import { filter, gain, loop, ramp, type LayerEnv } from '@/audio/graph/audio-utils';
import type { Layer } from '@/audio/graph/layer';
import type { CarAudioFrame } from '@/types/audio';

const WIND_LEVEL = 0.55;

/** Air rushing past: pink noise whose level follows speed squared and whose colour brightens with speed. */
export class WindLayer implements Layer {
  private readonly level: GainNode;
  private readonly band: BiquadFilterNode;

  constructor(env: LayerEnv, out: AudioNode) {
    this.level = gain(env, 0, out);
    this.band = filter(env, 'bandpass', 800, 0.45);
    loop(env, env.noise.pink, 0.7).connect(this.band).connect(filter(env, 'lowpass', 5000)).connect(this.level);
  }

  update(frame: CarAudioFrame, t: number, mix: LayerMix): void {
    ramp(this.level.gain, windGain(frame.speedKmh) * WIND_LEVEL * mix.wind, t, 0.08);
    ramp(this.band.frequency, windCutoffHz(frame.speedKmh), t, 0.1);
  }
}
