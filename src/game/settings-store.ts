import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { headMotionAmount } from '@/camera/head-motion';
import { loadQualityChoice } from '@/game/quality-store';
import { steerOnboarded, touchOptions } from '@/input/touch-model';

const KEY = 'bathurst.settings.v1';

export function loadSettings(): Settings {
  // Every device starts on High; automatic quality is opt-in.
  const defaults: Settings = { ...DEFAULT_SETTINGS };
  let saved: Partial<Settings> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = (JSON.parse(raw) as Partial<Settings> | null) ?? {};
  } catch { /* storage unavailable */ }
  const settings = { ...defaults, ...saved };
  // Graphics come only from the quality store, so a quality saved here by an older version
  // (often a low automatic result) does not survive the move to High by default.
  const graphics = loadQualityChoice(defaults);
  const touch = touchOptions(settings);
  return { ...settings, headMotion: headMotionAmount(settings.headMotion), quality: graphics.quality, autoQuality: graphics.automatic,
    touchMode: touch.mode, touchAnalogThrottle: touch.analogThrottle,
    touchAutoThrottle: touch.autoThrottle, touchLeftHanded: touch.leftHanded, steerOnboarded: steerOnboarded(settings) };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
