import { synthCrackleLoop, synthNoise } from '@/audio/dsp/oneshot-synth';

/** Pre-rendered looping noise shared by every layer of one audio context. */
export interface NoiseSet {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  /** Sparse random clicks: gravel crunch when played back fast. */
  crackle: AudioBuffer;
}

export function toBuffer(ctx: BaseAudioContext, data: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  return buf;
}

export function buildNoiseSet(ctx: BaseAudioContext): NoiseSet {
  const sr = ctx.sampleRate;
  return {
    white: toBuffer(ctx, synthNoise(sr, 'white', 11)),
    pink: toBuffer(ctx, synthNoise(sr, 'pink', 23)),
    brown: toBuffer(ctx, synthNoise(sr, 'brown', 37)),
    crackle: toBuffer(ctx, synthCrackleLoop(sr, 51)),
  };
}
