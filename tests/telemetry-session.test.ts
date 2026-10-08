import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { sessionResults } from '@/game/session-results';
import { Vehicle } from '@/physics/vehicle';
import { compareLaps } from '@/race/telemetry-compare';
import { loadRecords, saveRecords } from '@/race/records';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { compactTelemetry, restoreTelemetry, type LapTelemetry } from '@/types/telemetry';
import { tracePath } from '@/ui/telemetry-chart';
import { adjust } from '@/ui/screen';
import { TelemetryScreen } from '@/ui/screens/telemetry';
import { type MenuNode, stubMenuDom } from './menu-dom-fixture';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);
let store: Map<string, string>;

beforeEach(() => {
  vi.useFakeTimers();
  store = new Map();
  vi.stubGlobal('localStorage', { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) });
});
afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture(): { session: RaceSession; vehicle: Vehicle } {
  const vehicle = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  const entity = { vehicle, reset: (s: number, d: number) => vehicle.reset(s, d), repair: () => vehicle.repair() } as unknown as CarEntity;
  const session = new RaceSession('camaro', track, line, entity);
  session.placeOnGrid();
  session.lights = -1;
  session.timer.startStandingLap();
  return { session, vehicle };
}

/** Feed actual vehicle telemetry through the same session update used after each physics step. */
function completeLap(session: RaceSession, vehicle: Vehicle, speed: number, throttle: number, brake: number): void {
  const count = session.laps.length;
  for (let i = 0; i < 10000 && session.laps.length === count; i++) {
    vehicle.tp.s = track.wrapS(vehicle.tp.s + speed * 0.1);
    vehicle.vx = Math.sin(vehicle.heading) * speed;
    vehicle.vz = Math.cos(vehicle.heading) * speed;
    Object.assign(vehicle.telemetry, { speed, throttle, brake });
    session.update(0.1);
  }
  expect(session.laps.length).toBe(count + 1);
}

describe('session telemetry and its ghost', () => {
  it('excludes the standing lap, compares two real full laps and preserves the best trace/ghost after a slower lap', () => {
    const { session, vehicle } = fixture();
    completeLap(session, vehicle, 50, 0.8, 0.1);
    expect(session.telemetrySnapshot().laps).toHaveLength(0);
    completeLap(session, vehicle, 50, 0.75, 0.1);
    completeLap(session, vehicle, 45, 0.5, 0.3);
    const data = session.telemetrySnapshot();
    expect(data.laps).toHaveLength(2);
    expect(data.best).toBe(data.laps[0]);
    expect(Math.abs(session.ghost!.duration - data.best!.timeS)).toBeLessThan(0.5); // the ghost replays the best lap
    expect(data.laps[1].samples[10]).toMatchObject({ speedKmh: 162, throttle: 0.5, brake: 0.3 });
    expect(data.best?.samples[10]).toMatchObject({ speedKmh: 180, throttle: 0.75, brake: 0.1 });
    const comparison = compareLaps(data.laps[1], data.best!, data.corners);
    expect(comparison.corners).toHaveLength(23);
    expect(comparison.corners[0].fromM).toBe(0);
    expect(comparison.corners.at(-1)?.toM).toBe(track.length);
    expect(comparison.corners.reduce((sum, c) => sum + c.deltaS, 0)).toBeCloseTo(comparison.lapDeltaS, 10);
    expect(comparison.corners.reduce((sum, c) => sum + c.deltaMs, 0)).toBe(Math.round(comparison.lapDeltaS * 1000));
    vi.runAllTimers();
    const restored = loadRecords('camaro');
    expect(restored?.ghost).toBeDefined();
    expect(restored?.telemetry).toEqual(compactTelemetry(data.best!)); // saved rounded
    const reloaded = fixture().session, reload = reloaded.telemetrySnapshot();
    expect(reload.best).toEqual(compactTelemetry(data.best!));
    expect(reloaded.ghost).not.toBeNull();
    expect(reload.laps).toHaveLength(0);
    const [laps, best] = sessionResults(session);
    expect(laps).toHaveLength(3);
    expect(best.camaro?.timeS).toBe(data.best?.timeS);
  });

  it('offers each recorded lap once as a reference: the ghost is the best lap, not a second entry', () => {
    const { session, vehicle } = fixture();
    completeLap(session, vehicle, 50, 1, 0); // standing
    completeLap(session, vehicle, 50, 1, 0); // best (and ghost)
    completeLap(session, vehicle, 45, 1, 0);
    completeLap(session, vehicle, 44, 1, 0);
    expect(session.ghost).not.toBeNull();
    stubMenuDom();
    const screen = new TelemetryScreen(() => session.telemetrySnapshot(), () => {}, () => 'kmh');
    screen.onShow(); // inspects the latest lap (4)
    const row = screen.items()[1] as unknown as MenuNode;
    const value = (): string => row.querySelectorAll('.mn-value__v')[0].textContent.replace(/ ·.*/, '');
    const seen = [value()];
    for (let i = 0; i < 6 && (seen.length === 1 || seen.at(-1) !== seen[0]); i++) { adjust(row as unknown as HTMLElement, 1); seen.push(value()); }
    expect(seen.slice(0, -1)).toEqual(['Best lap', 'Lap 3']);
  });

  it('starts Results empty for a new session even with saved laps, then lists only the laps driven', () => {
    const first = fixture();
    completeLap(first.session, first.vehicle, 50, 1, 0);
    completeLap(first.session, first.vehicle, 50, 1, 0);
    vi.runAllTimers();
    const { session, vehicle } = fixture();
    expect(session.laps).toHaveLength(2); // saved history, kept for the next save
    expect(sessionResults(session)[0]).toEqual([]);
    completeLap(session, vehicle, 50, 1, 0);
    const [laps, best] = sessionResults(session);
    expect(laps).toEqual([session.laps[2]]);
    expect(best.camaro).toBe(session.laps[1]); // the saved flying lap is still the car's best
  });

  it('keeps an invalid lap available for analysis without promoting it to best or ghost', () => {
    const { session, vehicle } = fixture();
    completeLap(session, vehicle, 50, 1, 0);
    completeLap(session, vehicle, 50, 0.8, 0.1);
    const best = session.telemetrySnapshot().best;
    session.timer.invalidate();
    completeLap(session, vehicle, 55, 1, 0);
    const data = session.telemetrySnapshot();
    expect(data.laps.at(-1)?.valid).toBe(false);
    expect(data.best).toBe(best);
    expect(Math.abs(session.ghost!.duration - best!.timeS)).toBeLessThan(0.5);
  });

  it('leaves legacy saved ghosts without a pedal reference until a recorded new best is driven', () => {
    saveRecords('camaro', { bestS: 110, bestSectors: [40, 30, 40], ghost: new Float32Array(8 * 30 * 110), laps: [] });
    const { session, vehicle } = fixture();
    completeLap(session, vehicle, 50, 1, 0);
    completeLap(session, vehicle, 50, 1, 0); // slower than legacy best
    expect(session.ghost?.duration).toBeCloseTo(110, 0); // the legacy ghost still runs, without a trace
    expect(session.telemetrySnapshot().best).toBeNull();
    completeLap(session, vehicle, 58, 1, 0); // faster than legacy best
    const best = session.telemetrySnapshot().best;
    expect(best?.timeS).toBeLessThan(110);
    expect(Math.abs(session.ghost!.duration - best!.timeS)).toBeLessThan(0.5);
  });
});

describe('saved telemetry and rendered trace data', () => {
  const lap: LapTelemetry = { lapNumber: 2, lengthM: 1000, timeS: 100, valid: true, samples: [
    { distanceM: 0, timeS: 0, speedKmh: 0, throttle: 0, brake: 1 },
    { distanceM: 500, timeS: 50, speedKmh: 180, throttle: 0.8, brake: 0 },
    { distanceM: 1000, timeS: 100, speedKmh: 90, throttle: 0.3, brake: 0.4 },
  ] };

  it('rejects mismatched, incomplete or corrupt traces rather than attaching them to a best/ghost', () => {
    expect(restoreTelemetry(lap, 100, 1000)).toEqual(lap);
    expect(restoreTelemetry(lap, 101)).toBeNull();
    expect(restoreTelemetry(lap, 100, 6213)).toBeNull();
    expect(restoreTelemetry({ ...lap, valid: false }, 100)).toBeNull();
    expect(restoreTelemetry({ ...lap, samples: lap.samples.slice(1) }, 100)).toBeNull();
    expect(restoreTelemetry({ ...lap, samples: [lap.samples[0], { ...lap.samples[1], brake: 2 }, lap.samples[2]] }, 100)).toBeNull();
    expect(restoreTelemetry({ ...lap, samples: [lap.samples[0], lap.samples[2], lap.samples[1]] }, 100)).toBeNull();
    saveRecords('camaro', { bestS: 100, bestSectors: [30, 30, 40], laps: [], telemetry: lap });
    expect(loadRecords('camaro')?.telemetry).toBeUndefined(); // a 1 km trace cannot belong to Bathurst
    const bathurst = { ...lap, lengthM: 6213, samples: lap.samples.map(s => ({ ...s, distanceM: s.distanceM * 6.213 })) };
    saveRecords('camaro', { bestS: 100, bestSectors: [30, 30, 40], laps: [], telemetry: bathurst });
    expect(loadRecords('camaro')?.telemetry).toEqual(bathurst);
    store.set('bathurst.records.v2.camaro', JSON.stringify({ bestS: 101, bestSectors: [], laps: [], telemetry: lap }));
    expect(loadRecords('camaro')?.telemetry).toBeUndefined();
  });

  it('draws speed and pedals from their actual distance samples, including unit conversion', () => {
    expect(tracePath(lap, 'speedKmh', 180, 'kmh')).toBe('M40.00,84.00 L410.00,14.00 L780.00,49.00');
    expect(tracePath(lap, 'throttle', 1, 'kmh')).toBe('M40.00,84.00 L410.00,28.00 L780.00,63.00');
    expect(tracePath(lap, 'brake', 1, 'kmh')).toBe('M40.00,14.00 L410.00,84.00 L780.00,56.00');
    expect(tracePath(lap, 'speedKmh', 180 / 1.609344, 'mph')).toBe(tracePath(lap, 'speedKmh', 180, 'kmh'));
  });
});
