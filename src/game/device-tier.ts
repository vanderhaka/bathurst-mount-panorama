import type { QualityPreset } from '@/render/renderer';

/** What the browser says about the device; injectable so the choice can be tested. */
export interface DeviceHints {
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  coarsePointer: boolean;
  /** `(any-pointer: fine)`: a mouse or trackpad is attached. */
  finePointer: boolean;
  userAgent: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

const TOUCH_AGENT = /iPhone|iPad|iPod|Android/i;
/** Safari gives no deviceMemory and may report a reduced core count for privacy, so cores never judge an Apple device. */
const APPLE_AGENT = /iPhone|iPad|iPod|Macintosh/i;

/** First visit only (a stored choice always wins): phones and tablets start on Medium, weak ones on Low, the rest on High. */
export function defaultQualityFor(hints: DeviceHints): QualityPreset {
  const touch = (hints.coarsePointer && !hints.finePointer) || TOUCH_AGENT.test(hints.userAgent);
  if (!touch) return 'high';
  const weak = (hints.deviceMemory !== undefined && hints.deviceMemory <= 3)
    || (!APPLE_AGENT.test(hints.userAgent) && hints.hardwareConcurrency !== undefined && hints.hardwareConcurrency <= 4);
  return weak ? 'low' : 'medium';
}

export function readDeviceHints(): DeviceHints {
  const query = (q: string): boolean => typeof matchMedia === 'function' && matchMedia(q).matches;
  const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & { deviceMemory?: number };
  return {
    coarsePointer: query('(pointer: coarse)'),
    finePointer: query('(any-pointer: fine)'),
    userAgent: nav?.userAgent ?? '',
    deviceMemory: nav?.deviceMemory,
    hardwareConcurrency: nav?.hardwareConcurrency,
  };
}

export function deviceDefaultQuality(): QualityPreset {
  return defaultQualityFor(readDeviceHints());
}
