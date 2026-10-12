// The last race setup (opponents, laps, AI), kept between visits. Every field is checked against the allowed lists.
import { AI_SKILLS, DEFAULT_RACE_OPTIONS, RACE_LAPS, RACE_OPPONENTS, type RaceOptions } from '@/types/race';

export const RACE_OPTIONS_KEY = 'bathurst.race.options.v1';

function pick<T>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** The saved options, or the defaults for anything missing, malformed or not on offer. */
export function loadRaceOptions(): RaceOptions {
  const d = DEFAULT_RACE_OPTIONS;
  try {
    const raw = localStorage.getItem(RACE_OPTIONS_KEY);
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (typeof v !== 'object' || v === null) return { ...d };
    const o = v as Record<string, unknown>;
    return { opponents: pick(RACE_OPPONENTS, o.opponents, d.opponents), laps: pick(RACE_LAPS, o.laps, d.laps), skill: pick(AI_SKILLS, o.skill, d.skill) };
  } catch {
    return { ...d };
  }
}

export function saveRaceOptions(options: RaceOptions): void {
  try {
    localStorage.setItem(RACE_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    // Private mode or a full disk: the options simply are not remembered.
  }
}

/** The entry `dir` steps from `current` in `list`, wrapping at both ends. */
export function stepChoice<T>(list: readonly T[], current: T, dir: -1 | 1): T {
  const i = Math.max(0, list.indexOf(current));
  return list[(i + dir + list.length) % list.length];
}
