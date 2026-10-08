import type { QualityPreset } from '@/render/renderer';
import { pixelRatioForQuality } from '@/render/pixel-density';
import type { Settings } from '@/types/session';

export interface QualityChoice {
  quality: QualityPreset;
  pixelRatio: number;
  automatic: boolean;
}

/** Orientation-independent display/browser key. Only stored locally on this device.
 * Version 1 automatic results came from a monitor that ratcheted healthy hardware down. */
export function deviceQualityKey(version = 2): string {
  const size = typeof screen === 'undefined' ? [0, 0] : [screen.width, screen.height].sort((a, b) => a - b);
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return `bathurst.quality.v${version}.${JSON.stringify([agent, size, ratio, coarse])}`;
}

function readChoice(key: string): QualityChoice | null {
  const raw = localStorage.getItem(key);
  const value = raw ? JSON.parse(raw) as Partial<QualityChoice> | null : null;
  if (!value || !['low', 'medium', 'high'].includes(value.quality ?? '')
    || typeof value.pixelRatio !== 'number' || !Number.isFinite(value.pixelRatio)
    || value.pixelRatio < 0.5 || typeof value.automatic !== 'boolean') return null;
  const quality = value.quality as QualityPreset;
  return { quality, pixelRatio: pixelRatioForQuality(quality, value.pixelRatio), automatic: value.automatic };
}

export function loadQualityChoice(fallback: QualityPreset): QualityChoice {
  const defaults = { quality: fallback, pixelRatio: pixelRatioForQuality(fallback), automatic: true };
  try {
    const legacy = readChoice(deviceQualityKey(1));
    return readChoice(deviceQualityKey()) ?? (legacy?.automatic === false ? legacy : defaults);
  } catch { return defaults; }
}

export function saveQualityChoice(choice: QualityChoice): void {
  try { localStorage.setItem(deviceQualityKey(), JSON.stringify(choice)); }
  catch { /* localStorage unavailable */ }
}

export function qualityFromSettings(settings: Settings, previous: QualityChoice): QualityChoice {
  const resetDensity = settings.quality !== previous.quality || (!settings.autoQuality && previous.automatic);
  return {
    quality: settings.quality,
    pixelRatio: resetDensity ? pixelRatioForQuality(settings.quality) : previous.pixelRatio,
    automatic: settings.autoQuality,
  };
}
