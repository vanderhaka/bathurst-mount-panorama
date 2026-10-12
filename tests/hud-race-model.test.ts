import { expect, it } from 'vitest';
import { driverCode, formatInterval, selectRows } from '@/hud/race-model';
import type { RaceRow } from '@/types/race';

const row = (position: number, over: Partial<RaceRow> = {}): RaceRow => ({
  position, number: String(position), name: `Driver${position}`, car: 'camaro', isPlayer: false,
  lapsDone: 1, finished: false, finishTimeS: null, gapS: position === 1 ? null : position, lapsDown: 0, bestLapS: null, ...over,
});
const field = (n: number, player: number): RaceRow[] => Array.from({ length: n }, (_, i) => row(i + 1, { isPlayer: i + 1 === player, name: i + 1 === player ? 'You' : `Driver${i + 1}` }));

it('makes three-letter driver codes', () => {
  expect(driverCode({ name: 'Mick Doohan', isPlayer: false })).toBe('MIC');
  expect(driverCode({ name: "O'Neil", isPlayer: false })).toBe('ONE');
  expect(driverCode({ name: 'You', isPlayer: true })).toBe('YOU');
  expect(driverCode({ name: 'Al', isPlayer: false })).toBe('AL');
});

it('shows the whole field when it fits', () => {
  expect(selectRows(field(6, 6))).toEqual([0, 1, 2, 3, 4, 5]);
  expect(selectRows(field(8, 8))).toHaveLength(8);
});

it('shows the leader plus the rows around the player in a long field', () => {
  expect(selectRows(field(12, 3), 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(selectRows(field(12, 12), 8)).toEqual([0, 5, 6, 7, 8, 9, 10, 11]);
  const mid = selectRows(field(12, 9), 8);
  expect(mid[0]).toBe(0);
  expect(mid).toContain(8);
  expect(mid).toHaveLength(8);
});

it('formats the interval to the car ahead', () => {
  const rows = [row(1), row(2, { gapS: 1.2346 }), row(3, { gapS: 3 }), row(4, { gapS: 9, lapsDown: 1 }), row(5, { gapS: 9, lapsDown: 3 })];
  expect(formatInterval(rows, 0)).toBe('LEADER');
  expect(formatInterval(rows, 1)).toBe('+1.235');
  expect(formatInterval(rows, 2)).toBe('+1.765');
  expect(formatInterval(rows, 3)).toBe('+1 LAP');
  expect(formatInterval(rows, 4)).toBe('+2 LAPS');
  expect(formatInterval([row(1), row(2, { gapS: null })], 1)).toBe('');
  expect(formatInterval([row(1, { finished: true }), row(2, { finished: true })], 1)).toBe('FIN');
});
