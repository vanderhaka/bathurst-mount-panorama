import { LEVEL_PRESETS } from '@/race/driving-levels';
import type { Settings } from '@/types/session';

/** Arcade practice and Top 10 use the same conditions for everyone: pro rules, but with ABS, traction control and
 * steering assist on. Phone and keyboard pedals are on/off, so without them every brake press locks the wheels
 * and the car spins. Steering sensitivity and other controls stay the player's own. */
export function competitionSettings(settings: Settings): Settings {
  return { ...settings, ...LEVEL_PRESETS.superstar, abs: true, tractionControl: true, steeringAssist: true, ghost: false, touchAutoThrottle: false };
}
