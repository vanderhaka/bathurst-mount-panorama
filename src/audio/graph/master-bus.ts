import { ceilingCurve, finite, ramp, type LayerEnv } from '@/audio/graph/audio-utils';

/**
 * Final stage: user volume, a compressor to glue and tame peaks, then a soft
 * ceiling waveshaper so the output can never reach 0 dBFS. An analyser tap
 * (not in the signal path) feeds the harness scope.
 */
export class MasterBus {
  readonly input: GainNode;
  readonly analyser: AnalyserNode;
  private readonly master: GainNode;

  constructor(env: LayerEnv) {
    const { ctx, bag } = env;
    this.input = bag.add(ctx.createGain());
    this.master = bag.add(ctx.createGain());
    const comp = bag.add(ctx.createDynamicsCompressor());
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const clip = bag.add(ctx.createWaveShaper());
    clip.curve = ceilingCurve();
    clip.oversample = '2x';
    this.analyser = bag.add(ctx.createAnalyser());
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.6;
    this.input.connect(this.master);
    this.master.connect(comp);
    comp.connect(clip);
    clip.connect(ctx.destination);
    clip.connect(this.analyser);
  }

  setVolume(v: number, t: number): void {
    ramp(this.master.gain, Math.max(0, finite(v, 1)), t, 0.05);
  }
}
