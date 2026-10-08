import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionResults } from '@/game/session-results';
import { loadRecords, saveRecords, type CarRecords } from '@/race/records';
import type { CarKind } from '@/car/car-specs';

const record = (car: CarKind, timeS: number): CarRecords => ({ bestS: timeS, bestSectors: [timeS / 3, timeS / 3, timeS / 3],
  laps: [{ car, timeS, sectorsS: [timeS / 3, timeS / 3, timeS / 3], valid: true, dateIso: '2026-10-08T00:00:00Z' }] });

describe('records stay with their circuit', () => {
  const storage = new Map<string, string>();
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps existing Bathurst keys while accepting legitimate shorter Adelaide laps', () => {
    saveRecords('camaro', record('camaro', 124));
    saveRecords('camaro', record('camaro', 80), 'adelaide');
    expect(storage.has('bathurst.records.v2.camaro')).toBe(true);
    expect(loadRecords('camaro')?.bestS).toBe(124);
    expect(loadRecords('camaro', 'adelaide')?.bestS).toBe(80);
  });

  it('still rejects impossible laps on each circuit', () => {
    saveRecords('camaro', record('camaro', 80));
    saveRecords('camaro', record('camaro', 30), 'adelaide');
    expect(loadRecords('camaro')?.bestS).toBe(Infinity);
    expect(loadRecords('camaro', 'adelaide')?.bestS).toBe(Infinity);
    expect(loadRecords('camaro', 'adelaide')?.laps).toEqual([]);
  });

  it('does not mix the other cars’ Bathurst history into Adelaide results', () => {
    saveRecords('mustang', record('mustang', 124));
    saveRecords('mustang', record('mustang', 81), 'adelaide');
    const camaro = record('camaro', 80).laps;
    const [laps, best] = sessionResults({ car: 'camaro', laps: camaro, sessionLaps: camaro, track: { id: 'adelaide' } });
    expect(laps.map(l => l.timeS)).toEqual([80]);
    expect(best.mustang?.timeS).toBe(81);
  });
});
