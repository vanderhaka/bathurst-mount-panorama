// Driving levels: the Casual, Experienced and Superstar presets, the Custom state, and the
// level a lap counts for (its own best lap and ghost). Pure (no DOM) so it can be unit-tested.
// Car setup and tyre compound are free at every level: every player has the same tools.
import type { DrivingLevel, Settings } from '@/types/session';

export type { DrivingLevel };
/** Custom: the rules match no level's card. */
export type LevelChoice = DrivingLevel | 'custom';

type RuleKey = 'racingLine' | 'autoGears' | 'tractionControl' | 'abs' | 'steeringAssist' | 'damage' | 'trackLimits' | 'wear' | 'autoRecover';
/** The settings that decide a level. Display, camera, graphics and controls are not rules. */
export type Rules = Pick<Settings, RuleKey>;

export const RULE_KEYS: readonly RuleKey[] = ['racingLine', 'autoGears', 'tractionControl', 'abs', 'steeringAssist', 'damage', 'trackLimits', 'wear', 'autoRecover'];

/** Least strict first: a lap counts for the highest level whose rules it obeyed. */
export const LEVELS: readonly DrivingLevel[] = ['casual', 'experienced', 'superstar'];

export const LEVEL_PRESETS: Readonly<Record<DrivingLevel, Rules>> = {
  casual: { racingLine: 'full', autoGears: true, tractionControl: true, abs: true, steeringAssist: true, damage: 'off', trackLimits: false, wear: false, autoRecover: true },
  experienced: { racingLine: 'braking', autoGears: true, tractionControl: true, abs: true, steeringAssist: true, damage: 'visual', trackLimits: true, wear: true, autoRecover: false },
  superstar: { racingLine: 'off', autoGears: false, tractionControl: false, abs: false, steeringAssist: false, damage: 'full', trackLimits: true, wear: true, autoRecover: false },
};

/** Card title, short badge (results, HUD) and one-line description. */
export const LEVEL_NAMES: Readonly<Record<LevelChoice, { title: string; badge: string; tagline: string }>> = {
  casual: { title: 'Casual', badge: 'Casual', tagline: 'Get in and drive.' },
  experienced: { title: 'Experienced', badge: 'Experienced', tagline: 'A real car with some help.' },
  superstar: { title: 'Supercar Superstar', badge: 'Superstar', tagline: 'The real Gen3 car. No help.' },
  custom: { title: 'Custom', badge: 'Custom', tagline: 'Choose every rule yourself.' },
};

/** The three rules an Experienced player chooses, with the values Experienced allows. */
export const EXPERIENCED_CHOICES: { readonly racingLine: readonly Settings['racingLine'][]; readonly autoGears: readonly boolean[]; readonly damage: readonly Settings['damage'][] } = {
  racingLine: ['braking', 'off'],
  autoGears: [true, false],
  damage: ['visual', 'full'],
};

const EXPERIENCED_FIXED = ['tractionControl', 'abs', 'steeringAssist', 'trackLimits', 'wear', 'autoRecover'] as const;

function sameRules(a: Rules, b: Rules): boolean {
  return RULE_KEYS.every((k) => a[k] === b[k]);
}

/** Whether these rules are strict enough for the level's records. Casual takes every lap. */
function obeys(level: DrivingLevel, r: Rules): boolean {
  if (level === 'superstar') return sameRules(r, LEVEL_PRESETS.superstar);
  if (level === 'experienced') return r.trackLimits && r.wear && !r.autoRecover && r.damage !== 'off' && r.racingLine !== 'full';
  return true;
}

/** The highest level whose rules these settings obey: where a lap driven with them is recorded. */
export function lapLevel(r: Rules): DrivingLevel {
  for (let i = LEVELS.length - 1; i > 0; i--) if (obeys(LEVELS[i], r)) return LEVELS[i];
  return 'casual';
}

/** 0 = Casual, 2 = Superstar. */
export function levelRank(level: DrivingLevel): number {
  return LEVELS.indexOf(level);
}

/** The card these settings match: Casual and Superstar exactly, Experienced with its fixed rules and allowed choices. */
export function levelChoice(r: Rules): LevelChoice {
  if (sameRules(r, LEVEL_PRESETS.superstar)) return 'superstar';
  if (sameRules(r, LEVEL_PRESETS.casual)) return 'casual';
  const e = LEVEL_PRESETS.experienced;
  const fixed = EXPERIENCED_FIXED.every((k) => r[k] === e[k]);
  const chosen = EXPERIENCED_CHOICES.racingLine.includes(r.racingLine) && EXPERIENCED_CHOICES.damage.includes(r.damage);
  return fixed && chosen ? 'experienced' : 'custom';
}

/** Applies a level's rules. A player who already has Experienced keeps their own Experienced choices. */
export function applyLevel(s: Settings, level: DrivingLevel): Settings {
  if (level === 'experienced' && levelChoice(s) === 'experienced') return s;
  return { ...s, ...LEVEL_PRESETS[level] };
}
