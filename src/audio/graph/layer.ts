import type { LayerMix } from '@/audio/dsp/mix-maps';
import type { CarAudioFrame } from '@/types/audio';

/** A continuously running sound layer driven once per frame. */
export interface Layer {
  update(frame: CarAudioFrame, t: number, mix: LayerMix): void;
}
