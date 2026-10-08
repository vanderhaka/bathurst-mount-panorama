import type { QualityPreset } from '@/render/renderer';
import { pixelRatioForQuality } from '@/render/pixel-density';
import type { Settings } from '@/types/session';

export interface QualityChoice {
  quality: QualityPreset;
  pixelRatio: number;
  automatic: boolean;
}

/** One entry per browser profile, which is already local to this device. It deliberately
 * ignores the user agent and pixel ratio, so browser updates and desktop zoom keep it.
 * Version 1 automatic results came from a monitor that ratcheted healthy hardware down.
 * Version 2 results came from automatic quality being on by default; version 3 starts every device on High. */
const KEY = 'bathurst.quality.v3';

/** Stored density: null is the tier default for the current display and zoom; a number is a learned reduction. */
type StoredChoice = Omit<QualityChoice, 'pixelRatio'> & { pixelRatio: number | null };

function readChoice(): QualityChoice | null {
  const raw = localStorage.getItem(KEY);
  const value = raw ? JSON.parse(raw) as Partial<StoredChoice> | null : null;
  const density = value?.pixelRatio ?? null;
  if (!value || !['low', 'medium', 'high'].includes(value.quality ?? '') || typeof value.automatic !== 'boolean'
    || (density !== null && (typeof density !== 'number' || !Number.isFinite(density) || density < 0.5))) return null;
  const quality = value.quality as QualityPreset;
  return { quality, pixelRatio: pixelRatioForQuality(quality, density ?? Infinity), automatic: value.automatic };
}

/** The stored result, else the fallback tier at its default pixel density. */
export function loadQualityChoice(fallback: Pick<Settings, 'quality' | 'autoQuality'>): QualityChoice {
  const defaults = { quality: fallback.quality, pixelRatio: pixelRatioForQuality(fallback.quality), automatic: fallback.autoQuality };
  try { return readChoice() ?? defaults; }
  catch { return defaults; }
}

export function saveQualityChoice(choice: QualityChoice): void {
  const reduced = choice.pixelRatio < pixelRatioForQuality(choice.quality) - 1e-6;
  const stored: StoredChoice = { ...choice, pixelRatio: reduced ? choice.pixelRatio : null };
  try { localStorage.setItem(KEY, JSON.stringify(stored)); }
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
