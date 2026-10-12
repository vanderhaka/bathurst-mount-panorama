import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RACE_OPTIONS } from '@/types/race';
import { loadRaceOptions, RACE_OPTIONS_KEY, saveRaceOptions, stepChoice } from '@/ui/race-options-store';

const data = new Map<string, string>();
beforeEach(() => {
  data.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('race options store', () => {
  it('defaults when nothing is saved', () => {
    expect(loadRaceOptions()).toEqual(DEFAULT_RACE_OPTIONS);
  });

  it('round trips', () => {
    saveRaceOptions({ opponents: 7, laps: 10, skill: 'hard' });
    expect(loadRaceOptions()).toEqual({ opponents: 7, laps: 10, skill: 'hard' });
  });

  it('falls back field by field', () => {
    data.set(RACE_OPTIONS_KEY, JSON.stringify({ opponents: 4, laps: 5, skill: 'brutal' }));
    expect(loadRaceOptions()).toEqual({ ...DEFAULT_RACE_OPTIONS, laps: 5 });
    data.set(RACE_OPTIONS_KEY, JSON.stringify({ opponents: '7', laps: null }));
    expect(loadRaceOptions()).toEqual(DEFAULT_RACE_OPTIONS);
  });

  it('survives garbage and unusable storage', () => {
    for (const raw of ['{nope', 'null', '[]', '42']) {
      data.set(RACE_OPTIONS_KEY, raw);
      expect(loadRaceOptions()).toEqual(DEFAULT_RACE_OPTIONS);
    }
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } });
    expect(loadRaceOptions()).toEqual(DEFAULT_RACE_OPTIONS);
    expect(() => saveRaceOptions(DEFAULT_RACE_OPTIONS)).not.toThrow();
  });

  it('steps through a list and wraps', () => {
    expect(stepChoice([3, 5, 7], 7, 1)).toBe(3);
    expect(stepChoice([3, 5, 7], 3, -1)).toBe(7);
    expect(stepChoice([3, 5, 7], 5, 1)).toBe(7);
  });
});
