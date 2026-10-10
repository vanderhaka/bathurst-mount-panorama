import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { headMotionAmount } from '@/camera/head-motion';
import { loadQualityChoice } from '@/game/quality-store';
import { steerOnboarded, TOUCH_STEER_SCALE, touchOptions } from '@/input/touch-model';

const KEY = 'bathurst.settings.v1';
/** Set once a saved Touch sensitivity has been converted to the rescaled range (TOUCH_STEER_SCALE). */
const TOUCH_SCALE_KEY = 'bathurst.steerTouch.v2';

/** A tuned Touch sensitivity keeps its feel (old value / new scale, on the 0.1 grid of 0.5..2). The untouched old
 * default (1) moves to the new default (1), which is the calmer steering play-testing asked for. */
export function rescaledTouchSensitivity(old: number): number {
  if (old === 1) return 1;
  return Math.min(2, Math.max(0.5, Math.round(old / TOUCH_STEER_SCALE * 10) / 10));
}

export function loadSettings(): Settings {
  // Every device starts on High; automatic quality steps it down only when the device cannot keep up.
  const defaults: Settings = { ...DEFAULT_SETTINGS };
  let saved: Partial<Settings> = {};
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = (JSON.parse(raw) as Partial<Settings> | null) ?? {};
    if (localStorage.getItem(TOUCH_SCALE_KEY) === null) {
      if (typeof saved.steerTouch === 'number' && Number.isFinite(saved.steerTouch)) {
        saved = { ...saved, steerTouch: rescaledTouchSensitivity(saved.steerTouch) };
        if (raw) localStorage.setItem(KEY, JSON.stringify(saved));
      }
      localStorage.setItem(TOUCH_SCALE_KEY, '1');
    }
  } catch { /* storage unavailable */ }
  const settings = { ...defaults, ...saved };
  // Graphics come only from the quality store, so a quality saved here by an older version
  // (often a low automatic result) does not survive the move to High by default.
  const graphics = loadQualityChoice(defaults);
  const touch = touchOptions(settings);
  return { ...settings, headMotion: headMotionAmount(settings.headMotion), quality: graphics.quality, autoQuality: graphics.automatic,
    touchMode: touch.mode, touchAnalogThrottle: touch.analogThrottle, touchAnalogBrake: touch.analogBrake,
    touchAutoThrottle: touch.autoThrottle, touchLeftHanded: touch.leftHanded, steerOnboarded: steerOnboarded(settings),
    onboarded: settings.onboarded === true, trackLimits: settings.trackLimits !== false, wear: settings.wear !== false,
    autoRecover: settings.autoRecover === true };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
