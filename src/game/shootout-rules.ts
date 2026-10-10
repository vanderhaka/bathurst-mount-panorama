import { LEVEL_PRESETS } from '@/race/driving-levels';
import type { Settings } from '@/types/session';

/** Arcade practice and Top 10 use the same pro conditions. */
export function competitionSettings(settings: Settings): Settings {
  return { ...settings, ...LEVEL_PRESETS.superstar, ghost: false, touchAutoThrottle: false };
}
