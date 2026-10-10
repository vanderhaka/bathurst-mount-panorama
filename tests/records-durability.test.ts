import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeGhost, GHOST_RATE } from '@/race/ghost';
import { loadRecords, saveRecords, type CarRecords } from '@/race/records';
import { flushRecords, queueRecordsSave } from '@/race/records-queue';
import { compactTelemetry, restoreTelemetry, type LapTelemetry } from '@/types/telemetry';
import { adjust } from '@/ui/screen';
import { TitleScreen } from '@/ui/screens/title';
import { stubMenuDom } from './menu-dom-fixture';

const KEY = 'bathurst.records.v2.camaro';
const LENGTH = 6213, BEST = 124.0371234567;

/** A Bathurst flying lap at 10 Hz with real-looking float noise in every value. */
function trace(): LapTelemetry {
  const samples = [{ distanceM: 0, timeS: 0, speedKmh: 251.123456789, throttle: 1, brake: 0 }];
  for (let i = 1; i * 0.1 < BEST - 0.05; i++) {
    const t = i * 0.1 + 0.0000123 * Math.sin(i), f = t / BEST;
    samples.push({ distanceM: LENGTH * f, timeS: t, speedKmh: 170 + 90 * Math.sin(i / 37) + 0.123456789, throttle: Math.abs(Math.sin(i / 23)) * 0.987654321, brake: Math.max(0, -Math.sin(i / 23)) * 0.876543219 });
  }
  samples.push({ distanceM: LENGTH, timeS: BEST, speedKmh: 248.987654321, throttle: 1, brake: 0 });
  return { lapNumber: 4, lengthM: LENGTH, timeS: BEST, valid: true, samples };
}

function record(): CarRecords {
  const ghost = new Float32Array(Math.round(BEST * GHOST_RATE) * 8).map((_, i) => Math.sin(i) * 500);
  const laps = Array.from({ length: 50 }, (_, i) => ({ car: 'camaro' as const, timeS: BEST + i * 0.37, sectorsS: [50.1234567, 40.1234567, 33.7902099 + i * 0.37], valid: true, dateIso: '2026-10-08T10:00:00.000Z' }));
  return { bestS: BEST, bestSectors: [50.1, 40.1, 33.8371234567], trace: Array.from({ length: 622 }, (_, i) => i * 0.1996123456789), ghost, telemetry: trace(), laps };
}

let store: Map<string, string>;
/** localStorage that refuses values longer than `limit` characters, like a full quota. */
function storage(limit = Infinity): void {
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => {
    if (v.length > limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    store.set(k, v);
  } });
}
const stored = (): { ghost?: string; telemetry?: unknown; bestS: number; laps: unknown[] } => JSON.parse(store.get(KEY)!);

beforeEach(() => storage());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('records when storage is full', () => {
  it('drops the pedal trace first, keeping the best time, ghost and lap history', () => {
    saveRecords('camaro', { ...record(), telemetry: undefined });
    const withoutTrace = store.get(KEY)!.length;
    storage(withoutTrace + 10);
    saveRecords('camaro', record());
    expect(stored().telemetry).toBeUndefined();
    const back = loadRecords('camaro')!;
    expect(back.bestS).toBe(BEST);
    expect(back.ghost).toBeDefined();
    expect(back.laps).toHaveLength(50);
  });

  it('drops the ghost next, so the best time and lap history always persist', () => {
    saveRecords('camaro', { ...record(), telemetry: undefined, ghost: undefined });
    storage(store.get(KEY)!.length + 10);
    saveRecords('camaro', record());
    expect(stored().ghost).toBeUndefined();
    const back = loadRecords('camaro')!;
    expect(back.bestS).toBe(BEST);
    expect(back.bestSectors).toEqual([50.1, 40.1, 33.8371234567]);
    expect(back.laps).toHaveLength(50);
  });

  it('never throws when storage refuses every write', () => {
    storage(0);
    expect(() => saveRecords('camaro', record())).not.toThrow();
    expect(store.size).toBe(0);
  });
});

describe('saved trace size and compatibility', () => {
  it('saves a rounded trace about 40 % smaller that still passes load validation', () => {
    const lap = trace(), compact = compactTelemetry(lap);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(lap).length * 0.65);
    expect(restoreTelemetry(compact, BEST, LENGTH)).toBe(compact);
    expect(compact.samples[0]).toMatchObject({ distanceM: 0, timeS: 0 });
    expect(compact.samples.at(-1)).toMatchObject({ distanceM: LENGTH, timeS: BEST });
    saveRecords('camaro', record());
    expect(loadRecords('camaro')?.telemetry).toEqual(compact);
  });

  it('drops samples that rounding would make equal to a neighbour', () => {
    const lap = trace();
    const s = lap.samples;
    s.splice(2, 0, { ...s[1], distanceM: s[1].distanceM + 0.0004, timeS: s[1].timeS + 0.1 }); // same millimetre
    s.splice(s.length - 1, 0, { ...s[s.length - 2], distanceM: LENGTH - 0.0003, timeS: BEST - 0.01 }); // rounds onto the line
    expect(restoreTelemetry(lap, BEST, LENGTH)).toBe(lap);
    const compact = compactTelemetry(lap);
    expect(compact.samples).toHaveLength(lap.samples.length - 2);
    expect(restoreTelemetry(compact, BEST, LENGTH)).toBe(compact);
  });

  it('still loads records saved by main (full-precision trace, same key)', () => {
    const r = record();
    store.set(KEY, JSON.stringify({ bestS: r.bestS, bestSectors: r.bestSectors, trace: r.trace, ghost: encodeGhost(r.ghost!), telemetry: r.telemetry, laps: r.laps }));
    const back = loadRecords('camaro')!;
    expect(back.telemetry).toEqual(r.telemetry);
    expect(back.ghost?.length).toBe(r.ghost!.length);
    expect(back.laps).toHaveLength(50);
  });
});

describe('queued record saves', () => {
  it('waits for idle time, but writes at once when flushed (quit to title)', () => {
    vi.useFakeTimers();
    queueRecordsSave('camaro', record(), 'bathurst');
    expect(store.has(KEY)).toBe(false);
    flushRecords();
    expect(loadRecords('camaro')?.bestS).toBe(BEST);
    store.clear();
    vi.runAllTimers(); // the idle callback finds nothing left to write
    expect(store.size).toBe(0);
  });

  it('keeps only the latest pending save per car and circuit', () => {
    vi.useFakeTimers();
    queueRecordsSave('camaro', { ...record(), laps: [] }, 'bathurst');
    queueRecordsSave('camaro', record(), 'bathurst');
    vi.runAllTimers();
    expect(loadRecords('camaro')?.laps).toHaveLength(50);
  });

  it('writes pending records when the page is hidden or closed', async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, () => void>();
    const doc = { visibilityState: 'visible', addEventListener: (type: string, fn: () => void) => listeners.set(`document:${type}`, fn) };
    vi.stubGlobal('window', { addEventListener: (type: string, fn: () => void) => listeners.set(`window:${type}`, fn) });
    vi.stubGlobal('document', doc);
    vi.resetModules();
    const queue = await import('@/race/records-queue');
    queue.queueRecordsSave('camaro', record(), 'bathurst');
    listeners.get('window:pagehide')!();
    expect(store.has(KEY)).toBe(true);
    store.clear();
    queue.queueRecordsSave('camaro', record(), 'bathurst');
    doc.visibilityState = 'hidden';
    listeners.get('document:visibilitychange')!();
    expect(store.has(KEY)).toBe(true);
  });

  it('writes pending records before the title screen switches circuit', () => {
    vi.useFakeTimers();
    stubMenuDom();
    let savedBeforeLeaving: boolean | null = null;
    // The circuit switch leaves with location.replace (no history entry).
    vi.stubGlobal('location', { href: 'http://127.0.0.1/', replace: () => { savedBeforeLeaving = store.has(KEY); } });
    const title = new TitleScreen({ race() {}, shootout() {}, settings() {}, controls() {} });
    queueRecordsSave('camaro', record(), 'bathurst');
    adjust(title.items()[1], 1);
    expect(savedBeforeLeaving).toBe(true);
  });
});
