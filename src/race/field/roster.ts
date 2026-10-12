// Who is on the grid: car kinds, liveries with unique race numbers, fictional drivers and pace. Pure and
// deterministic for a seed, so a Restart fields the same cars.
import type { CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS, liveryNumber } from '@/car/liveries';
import { createRng, type Rng } from '@/props/core/rng';
import type { AiSkill, RaceOptions } from '@/types/race';
import type { Livery } from '@/types/car-model';

/** One AI car, in grid order (index 0 = pole). */
export interface RosterEntry {
  name: string;
  kind: CarKind;
  livery: Livery;
  /** Race number as painted ('97'). */
  number: string;
  /** Autopilot pace multiplier. */
  pace: number;
  /** Speed profile grip factor for this skill. */
  gripFactor: number;
  /** Seed of this car's AiDriver. */
  seed: number;
}

/** AI speed-profile grip and base pace per skill. */
export const SKILL_TUNING: Record<AiSkill, { gripFactor: number; pace: number }> = {
  easy: { gripFactor: 0.86, pace: 0.95 },
  medium: { gripFactor: 0.9, pace: 0.99 },
  hard: { gripFactor: 0.93, pace: 1 },
};

/** Fictional drivers (invented; none is a real racing driver). */
export const DRIVER_NAMES: readonly string[] = [
  'A. Calloway', 'B. Thackeray', 'C. Pemberton', 'D. Kincaid', 'E. Marlowe', 'F. Hartigan',
  'G. Penrose', 'H. Ellery', 'J. Stannard', 'K. Wexford', 'L. Garrity', 'M. Lindqvist',
];

/** Numbers handed out when a preset's own number is taken. */
const NUMBER_POOL: readonly number[] = [3, 7, 9, 12, 14, 18, 19, 21, 22, 23, 27, 33, 35, 38, 47, 48, 51, 56, 60, 62, 66, 72, 77, 78, 82, 86, 99];
/** Pace spread between cars of one skill (fraction, +/- half of it). */
const PACE_SPREAD = 0.04;
/** Chance that a car swaps grid places with the one behind it after pace sorting, so the order is not frozen. */
const SWAP_CHANCE = 0.3;

/** Car kinds of the field: a Camaro or Mustang player races both Gen3 cars; any other car races its own kind. */
export function fieldKinds(player: CarKind, count: number): CarKind[] {
  const mixed = player === 'camaro' || player === 'mustang';
  return Array.from({ length: count }, (_, i) => (mixed ? (i % 2 === 0 ? 'camaro' : 'mustang') : player));
}

/** Pace per grid slot: faster cars nearer pole, with the odd neighbouring pair swapped. */
export function assignPaces(skill: AiSkill, count: number, rnd: Rng): number[] {
  const paces = Array.from({ length: count }, () => SKILL_TUNING[skill].pace * (1 + (rnd() - 0.5) * PACE_SPREAD));
  paces.sort((a, b) => b - a);
  for (let k = 0; k + 1 < count; k++) if (rnd() < SWAP_CHANCE) [paces[k], paces[k + 1]] = [paces[k + 1], paces[k]];
  return paces;
}

/** Distinct driver names in a seeded order. */
export function pickNames(count: number, rnd: Rng): string[] {
  const pool = DRIVER_NAMES.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}

/**
 * A livery and number per car. The player's preset is left out where the kind has another; presets repeat only
 * when the field is bigger than the presets of its kinds. Numbers are unique and never the player's.
 */
export function pickLiveries(kinds: readonly CarKind[], player: { car: CarKind; liveryIndex: number }, rnd: Rng): Array<{ livery: Livery; number: string }> {
  const taken = new Set<string>([liveryNumber(LIVERY_PRESETS[player.car][player.liveryIndex % LIVERY_PRESETS[player.car].length].livery)]);
  const used = new Map<string, number>();
  const spare = NUMBER_POOL.filter((n) => !taken.has(String(n)));
  let spareAt = Math.floor(rnd() * spare.length);
  return kinds.map((kind) => {
    const presets = LIVERY_PRESETS[kind];
    const own = kind === player.car ? player.liveryIndex % presets.length : -1;
    const options = presets.map((_, i) => i).filter((i) => i !== own);
    const pool = options.length ? options : [own];
    const fewest = Math.min(...pool.map((i) => used.get(`${kind}${i}`) ?? 0));
    const candidates = pool.filter((i) => (used.get(`${kind}${i}`) ?? 0) === fewest);
    const pick = candidates[Math.floor(rnd() * candidates.length)];
    used.set(`${kind}${pick}`, fewest + 1);
    const base = presets[pick].livery;
    let number = liveryNumber(base);
    let livery = base;
    if (taken.has(number)) {
      while (taken.has(String(spare[spareAt % spare.length]))) spareAt++;
      const n = spare[spareAt % spare.length];
      number = String(n);
      livery = { ...base, number: n, numberText: number };
    }
    taken.add(number);
    return { livery, number };
  });
}

/** The AI field for a race, in grid order. */
export function buildRoster(player: { car: CarKind; liveryIndex: number }, options: RaceOptions, seed: number): RosterEntry[] {
  const rnd = createRng(seed);
  const kinds = fieldKinds(player.car, options.opponents);
  const paces = assignPaces(options.skill, options.opponents, rnd);
  const names = pickNames(options.opponents, rnd);
  const liveries = pickLiveries(kinds, player, rnd);
  return kinds.map((kind, i) => ({
    name: names[i], kind, livery: liveries[i].livery, number: liveries[i].number, pace: paces[i],
    gripFactor: SKILL_TUNING[options.skill].gripFactor, seed: seed * 31 + i + 1,
  }));
}
