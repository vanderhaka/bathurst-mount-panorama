import { describe, expect, it } from 'vitest';
import type { CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS, liveryNumber } from '@/car/liveries';
import { createRng } from '@/props/core/rng';
import { buildRows, type Runner } from '@/race/field/classification';
import { clearSpot, hitReport, StuckWatch } from '@/race/field/field-rules';
import { gridSlots } from '@/race/field/grid';
import { RaceOrder } from '@/race/field/race-order';
import { assignPaces, buildRoster, DRIVER_NAMES, fieldKinds, pickLiveries, pickNames, SKILL_TUNING } from '@/race/field/roster';
import { Track } from '@/track/track-model';
import { AI_SKILLS } from '@/types/race';

const CARS: CarKind[] = ['camaro', 'mustang', 'supra', 'torana'];

describe('field kinds', () => {
  it('mixes Camaros and Mustangs for a Camaro or Mustang player and keeps other cars to their own kind', () => {
    for (const car of ['camaro', 'mustang'] as const) {
      const kinds = fieldKinds(car, 7);
      expect(new Set(kinds)).toEqual(new Set(['camaro', 'mustang']));
    }
    expect(fieldKinds('supra', 5).every((k) => k === 'supra')).toBe(true);
    expect(fieldKinds('torana', 3).every((k) => k === 'torana')).toBe(true);
  });
});

describe('pace', () => {
  it('stays within 2 % of the skill pace, is deterministic, and keeps faster cars nearer pole on the whole', () => {
    for (const skill of AI_SKILLS) {
      const paces = assignPaces(skill, 7, createRng(5));
      expect(assignPaces(skill, 7, createRng(5))).toEqual(paces);
      for (const p of paces) expect(Math.abs(p / SKILL_TUNING[skill].pace - 1)).toBeLessThanOrEqual(0.02 + 1e-9);
      expect(paces[0] + paces[1]).toBeGreaterThan(paces[5] + paces[6]);
    }
  });

  it('orders the skills easy < medium < hard in both pace and grip', () => {
    expect(SKILL_TUNING.easy).toEqual({ gripFactor: 0.86, pace: 0.95 });
    expect(SKILL_TUNING.medium).toEqual({ gripFactor: 0.9, pace: 0.99 });
    expect(SKILL_TUNING.hard).toEqual({ gripFactor: 0.93, pace: 1 });
  });

  it('does not freeze the order: some seeds swap neighbouring pairs', () => {
    const swapped = Array.from({ length: 20 }, (_, s) => assignPaces('medium', 7, createRng(s + 1)))
      .filter((p) => p.some((v, i) => i > 0 && v > p[i - 1]));
    expect(swapped.length).toBeGreaterThan(0);
  });
});

describe('names', () => {
  it('gives distinct fictional names', () => {
    const names = pickNames(7, createRng(3));
    expect(new Set(names).size).toBe(7);
    for (const n of names) expect(DRIVER_NAMES).toContain(n);
    expect(DRIVER_NAMES.length).toBeGreaterThanOrEqual(12);
  });
});

describe('liveries and numbers', () => {
  it('never uses the player number or repeats a number, for every car, preset and field size', () => {
    for (const car of CARS) {
      for (let liveryIndex = 0; liveryIndex < LIVERY_PRESETS[car].length; liveryIndex++) {
        for (const opponents of [3, 5, 7]) {
          const mine = liveryNumber(LIVERY_PRESETS[car][liveryIndex].livery);
          const picks = pickLiveries(fieldKinds(car, opponents), { car, liveryIndex }, createRng(opponents * 7 + liveryIndex));
          const numbers = picks.map((p) => p.number);
          expect(numbers).not.toContain(mine);
          expect(new Set(numbers).size).toBe(opponents);
          picks.forEach((p) => expect(liveryNumber(p.livery)).toBe(p.number));
        }
      }
    }
  });

  it("leaves the player's preset out where the kind has another", () => {
    const picks = pickLiveries(fieldKinds('supra', 3), { car: 'supra', liveryIndex: 2 }, createRng(1));
    const own = LIVERY_PRESETS.supra[2].livery;
    for (const p of picks) expect(p.livery.primary === own.primary && p.livery.secondary === own.secondary && p.livery.pattern === own.pattern).toBe(false);
  });

  it('spreads across presets before repeating one', () => {
    const picks = pickLiveries(fieldKinds('torana', 3), { car: 'torana', liveryIndex: 0 }, createRng(9));
    expect(new Set(picks.map((p) => p.livery.banner + p.livery.pattern)).size).toBe(3);
  });
});

describe('roster', () => {
  it('is the same for the same seed and sized to the field', () => {
    const a = buildRoster({ car: 'camaro', liveryIndex: 0 }, { opponents: 7, laps: 3, skill: 'hard' }, 42);
    expect(buildRoster({ car: 'camaro', liveryIndex: 0 }, { opponents: 7, laps: 3, skill: 'hard' }, 42)).toEqual(a);
    expect(a).toHaveLength(7);
    expect(new Set(a.map((r) => r.seed)).size).toBe(7);
    expect(a.every((r) => r.gripFactor === 0.93)).toBe(true);
  });
});

describe('grid assignment', () => {
  it('puts the player on the last of opponents + 1 slots, behind every AI car', () => {
    const track = new Track();
    const slots = gridSlots(track, 6);
    const behind = (s: number) => track.wrapS(track.gridLineS - s);
    for (let k = 0; k < 5; k++) expect(behind(slots[5].s)).toBeGreaterThan(behind(slots[k].s));
  });
});

describe('classification', () => {
  const runners: Runner[] = [
    { id: 'a', name: 'A', number: '1', isPlayer: false, car: 'camaro' },
    { id: 'b', name: 'B', number: '2', isPlayer: false, car: 'mustang' },
    { id: 'p', name: 'You', number: '97', isPlayer: true, car: 'camaro' },
  ];

  it('marks a lap down for cars that will be flagged a lap short, and shows no gap for them', () => {
    const track = new Track();
    const order = new RaceOrder(track.length, track.startLineS, 3, runners);
    runners.forEach((_, i) => order.place(i, track.wrapS(track.startLineS - 100)));
    const L = track.length;
    // Car 0 finishes 3 laps; the player is 1.5 laps in; car 1 one lap in.
    const at = (i: number, laps: number, t: number) => { let s = track.startLineS - 100; for (let k = 0; k < laps * L / 50; k++) { s += 50; order.update(i, track.wrapS(s), t * (k + 1) / (laps * L / 50)); } };
    at(0, 3.01, 300);
    at(2, 1.5, 300);
    at(1, 1.01, 300);
    const rows = buildRows(order.standings(), runners, 3);
    expect(rows.map((r) => r.name)).toEqual(['A', 'You', 'B']);
    expect(rows[0]).toMatchObject({ finished: true, gapS: null, lapsDown: 0, position: 1 });
    expect(rows[1]).toMatchObject({ isPlayer: true, finished: false, lapsDown: 1, gapS: null, lapsDone: 1 });
    // Car B has not yet crossed the line once (it started 100 m behind it): two laps short.
    expect(rows[2]).toMatchObject({ finished: false, lapsDown: 2, lapsDone: 0 });
  });
});

describe('field rules', () => {
  it('reports a hit to each car with a normal pointing away from the other car', () => {
    const hit = { a: 0, b: 1, x: 1, y: 2, z: 3, nx: 1, nz: 0, speed: 9 };
    expect(hitReport(hit, 0)).toMatchObject({ x: 1, y: 2, z: 3, nx: -1, speed: 9 });
    expect(Math.abs(hitReport(hit, 0).nz)).toBe(0);
    expect(hitReport(hit, 1)).toMatchObject({ nx: 1, nz: 0 });
  });

  it('puts a stuck car on the nearest clear spot along the track, wrapping the lap', () => {
    expect(clearSpot(1000, 500, [100, 800])).toBe(500);
    expect(clearSpot(1000, 500, [500])).toBe(490);
    expect(clearSpot(1000, 500, [500, 490])).toBe(510);
    expect(clearSpot(1000, 3, [3])).toBe(993);
    expect(clearSpot(1000, 500, Array.from({ length: 100 }, (_, i) => i * 10))).toBe(500);
  });

  it('calls a car stuck after 3 s nearly stopped, or 2 s off the road facing backwards, and only once settled', () => {
    const w = new StuckWatch();
    let fired = false;
    for (let i = 0; i < 400; i++) fired ||= w.update(0.01, false, 0, false, false);
    expect(fired).toBe(false);
    for (let i = 0; i < 290; i++) expect(w.update(0.01, true, 0.5, false, false)).toBe(false);
    for (let i = 0; i < 20; i++) fired ||= w.update(0.01, true, 0.5, false, false);
    expect(fired).toBe(true);
    for (let i = 0; i < 150; i++) expect(w.update(0.01, true, 20, true, true)).toBe(false);
    for (let i = 0; i < 100; i++) fired = w.update(0.01, true, 20, true, true) || fired;
    expect(fired).toBe(true);
    for (let i = 0; i < 1000; i++) expect(w.update(0.01, true, 20, true, false)).toBe(false);
  });
});
