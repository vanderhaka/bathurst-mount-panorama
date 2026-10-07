import type { QualityPreset } from '@/render/renderer';
import { pixelRatioForQuality } from '@/render/pixel-density';
import type { Settings } from '@/types/session';

export interface QualityChoice {
  quality: QualityPreset;
  pixelRatio: number;
  automatic: boolean;
}

/** Orientation-independent display/browser key. Only stored locally on this device. */
export function deviceQualityKey(): string {
  const size = typeof screen === 'undefined' ? [0, 0] : [screen.width, screen.height].sort((a, b) => a - b);
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  return `bathurst.quality.v1.${JSON.stringify([agent, size, ratio, coarse])}`;
}

export function loadQualityChoice(fallback: QualityPreset): QualityChoice {
  const defaults = { quality: fallback, pixelRatio: pixelRatioForQuality(fallback), automatic: true };
  try {
    const raw = localStorage.getItem(deviceQualityKey());
    const value = raw ? JSON.parse(raw) as Partial<QualityChoice> | null : null;
    if (!value || !['low', 'medium', 'high'].includes(value.quality ?? '')
      || typeof value.pixelRatio !== 'number' || !Number.isFinite(value.pixelRatio)
      || value.pixelRatio < 0.5 || typeof value.automatic !== 'boolean') return defaults;
    const quality = value.quality as QualityPreset;
    return { quality, pixelRatio: pixelRatioForQuality(quality, value.pixelRatio), automatic: value.automatic };
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
