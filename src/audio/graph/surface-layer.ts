import { kerbRumbleHz, surfaceSpeedGain, surfaceWeights, type LayerMix } from '@/audio/dsp/mix-maps';
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

const KERB_LEVEL = 0.9;
const GRAVEL_LEVEL = 0.55;
const GRASS_LEVEL = 0.6;

/** Off-asphalt noise beds, crossfaded by surface: kerb rumble pulses, gravel crunch, grass rumble. */
export class SurfaceLayer implements Layer {
  private readonly kerb: GainNode;
  private readonly gravel: GainNode;
  private readonly grass: GainNode;
  private readonly rumble: OscillatorNode;
  private readonly crackle: AudioBufferSourceNode;

  constructor(env: LayerEnv, out: AudioNode) {
    const { noise, ctx } = env;
    this.kerb = gain(env, 0, out);
    this.gravel = gain(env, 0, out);
    this.grass = gain(env, 0, out);

    // Kerb: low noise whose level is pulsed by rectified saw ramps at the serration rate.
    this.rumble = oscillator(env, 30);
    this.rumble.setPeriodicWave(sawWave(ctx));
    const rect = env.bag.add(ctx.createWaveShaper());
    rect.curve = halfWaveCurve();
    this.rumble.connect(rect);
    const pulsed = gain(env, 0, this.kerb);
    rect.connect(pulsed.gain);
    loop(env, noise.brown, 0.4).connect(filter(env, 'lowpass', 420)).connect(pulsed);
    this.rumble.connect(filter(env, 'lowpass', 520)).connect(gain(env, 0.1, this.kerb));

    // Gravel: random clicks played faster with speed, band-limited, plus a pink hiss.
    this.crackle = loop(env, noise.crackle, 0.2);
    this.crackle
      .connect(filter(env, 'highpass', 500))
      .connect(filter(env, 'bandpass', 2200, 0.6))
      .connect(this.gravel);
    loop(env, noise.pink, 1.4).connect(filter(env, 'bandpass', 3200, 0.8)).connect(gain(env, 0.1, this.gravel));

    // Grass: soft low rumble with a little leafy mid.
    loop(env, noise.brown, 1.1).connect(filter(env, 'lowpass', 260)).connect(this.grass);
    loop(env, noise.pink, 0.6).connect(filter(env, 'bandpass', 1100, 0.6)).connect(gain(env, 0.12, this.grass));
  }

  update(frame: CarAudioFrame, t: number, mix: LayerMix): void {
    const w = surfaceWeights(frame.surface);
    const speed = surfaceSpeedGain(frame.speedKmh) * mix.surface;
    ramp(this.kerb.gain, w.kerb * speed * KERB_LEVEL, t, 0.03);
    ramp(this.gravel.gain, w.gravel * speed * GRAVEL_LEVEL, t, 0.05);
    ramp(this.grass.gain, w.grass * speed * GRASS_LEVEL, t, 0.06);
    ramp(this.rumble.frequency, kerbRumbleHz(frame.speedKmh), t, 0.05);
    ramp(this.crackle.playbackRate, 0.5 + Math.min(1.1, frame.speedKmh / 150), t, 0.08);
  }
}
