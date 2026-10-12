import { describe, expect, it } from 'vitest';
import type { RaceResult, RaceRow } from '@/types/race';
import { bestLapCell, ordinal, raceHeadline, timeCell } from '@/ui/race-results-model';

const row = (o: Partial<RaceRow> = {}): RaceRow => ({
  position: 1, number: '97', name: 'You', car: 'camaro', isPlayer: false, lapsDone: 3, finished: true,
  finishTimeS: 305.4321, gapS: null, lapsDown: 0, bestLapS: 100.5, ...o,
});
const result = (rows: RaceRow[]): RaceResult => ({ circuit: 'Mount Panorama', laps: 3, skill: 'medium', rows });

describe('race results formatting', () => {
  it('orders ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  });

  it('shows the leader time, gaps, laps down and running', () => {
    expect(timeCell(row())).toBe('5:05.432');
    expect(timeCell(row({ position: 2, gapS: 1.2345, finishTimeS: 306.7 }))).toBe('+1.234');
    expect(timeCell(row({ position: 3, gapS: 75.5 }))).toBe('+1:15.500');
    expect(timeCell(row({ lapsDown: 1, gapS: 20 }))).toBe('+1 lap');
    expect(timeCell(row({ lapsDown: 2 }))).toBe('+2 laps');
    expect(timeCell(row({ finished: false, finishTimeS: null }))).toBe('Running');
    expect(timeCell(row({ finished: false, finishTimeS: null, gapS: 3.5 }))).toBe('+3.500');
  });

  it('shows a dash for no best lap', () => {
    expect(bestLapCell(row({ bestLapS: null }))).toBe('—');
    expect(bestLapCell(row())).toBe('1:40.500');
  });

  it('names the player finishing position', () => {
    const h = raceHeadline(result([row(), row({ position: 2, isPlayer: false, gapS: 2 }), row({ position: 3, isPlayer: true, gapS: 5 })]));
    expect(h).toEqual({ title: 'You finished P3', sub: 'Mount Panorama · 3 laps · Medium AI', finished: true });
  });

  it('says 1 lap, not 1 laps', () => {
    expect(raceHeadline({ ...result([row({ isPlayer: true })]), laps: 1 }).sub).toBe('Mount Panorama \u00b7 1 lap \u00b7 Medium AI');
  });

  it('shows the running order with a lap count before the player finishes', () => {
    const h = raceHeadline(result([row({ isPlayer: true, finished: false, lapsDone: 1, finishTimeS: null })]));
    expect(h).toEqual({ title: 'Running order', sub: 'Lap 2 of 3 · Medium AI', finished: false });
    expect(raceHeadline(result([row({ isPlayer: true, finished: false, lapsDone: 3, finishTimeS: null })])).sub).toBe('Lap 3 of 3 · Medium AI');
  });
});
