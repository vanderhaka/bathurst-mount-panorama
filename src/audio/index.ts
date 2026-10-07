import type { CarKind } from '@/car/car-specs';
import { createCarAudioDebug } from '@/audio/car-audio';
import type { CreateCarAudio } from '@/types/audio';

/**
 * Game entry point. Call order:
 *   const audio = createCarAudio(kind);          // construct (no sound yet)
 *   await audio.start();                          // from a user gesture
 *   every frame: audio.update(frame, dt);
 *   on events:   audio.impact(energy);            // collisions
 *   pause/menu:  audio.suspend() / audio.resume();
 *   teardown:    audio.dispose();
 * `context` may be an existing AudioContext shared with other game audio.
 */
export const createCarAudio: CreateCarAudio = (kind: CarKind, context?: AudioContext) =>
  createCarAudioDebug(kind, context);

export { createCarAudioDebug } from '@/audio/car-audio';
export type { CarAudioDebug, CarAudioOptions, EngineMode } from '@/audio/car-audio';
export { CAR_SOUND_PROFILES } from '@/audio/dsp/engine-profile';
export type { CarAudio, CarAudioFrame, Surface } from '@/types/audio';
