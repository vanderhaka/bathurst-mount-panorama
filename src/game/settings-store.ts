import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { headMotionAmount } from '@/camera/head-motion';
import { loadQualityChoice } from '@/game/quality-store';
import { touchOptions } from '@/input/touch-model';

const KEY = 'bathurst.settings.v1';

/** Phones (touch screen, small side at most 540 px) start on Medium graphics. */
function deviceDefaults(): Settings {
  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (max-height: 540px), (pointer: coarse) and (max-width: 540px)').matches;
  return phone ? { ...DEFAULT_SETTINGS, quality: 'medium' } : { ...DEFAULT_SETTINGS };
}

export function loadSettings(): Settings {
  let settings = deviceDefaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) settings = { ...settings, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* storage unavailable */ }
  const graphics = loadQualityChoice(settings.quality);
  const touch = touchOptions(settings);
  return { ...settings, headMotion: headMotionAmount(settings.headMotion), quality: graphics.quality, autoQuality: graphics.automatic,
    touchMode: touch.mode, touchAnalogThrottle: touch.analogThrottle,
    touchAutoThrottle: touch.autoThrottle, touchLeftHanded: touch.leftHanded };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
