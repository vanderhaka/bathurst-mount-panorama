import type { CarAudioFrame } from '@/types/audio';

export const SELFTEST_SAMPLE_RATE = 48000;

export function makeFrame(over: Partial<CarAudioFrame> = {}): CarAudioFrame {
  return {
    rpm: 3000,
    load: 1,
    throttle: 1,
    speedKmh: 0,
    gear: 0,
    onLimiter: false,
    slip: 0,
    scrub: 0,
    surface: 'asphalt',
    interior: 0,
    shifted: false,
    ...over,
  };
}
