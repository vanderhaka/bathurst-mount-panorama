import { DEFAULT_SETTINGS, type Settings } from '@/types/session';

const KEY = 'bathurst.settings.v1';

/** Phones (touch screen, small side at most 540 px) start on Medium graphics. */
function deviceDefaults(): Settings {
  const phone = typeof matchMedia === 'function' && matchMedia('(pointer: coarse) and (max-height: 540px), (pointer: coarse) and (max-width: 540px)').matches;
  return phone ? { ...DEFAULT_SETTINGS, quality: 'medium' } : { ...DEFAULT_SETTINGS };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...deviceDefaults(), ...(JSON.parse(raw) as Partial<Settings>) } : deviceDefaults();
  } catch {
    return deviceDefaults();
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
