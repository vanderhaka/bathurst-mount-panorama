import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarKind } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { sessionResults } from '@/game/session-results';
import { LEVEL_PRESETS } from '@/race/driving-levels';
import { loadRecords, saveRecords, type CarRecords } from '@/race/records';
import { flushRecords } from '@/race/records-queue';
import type { RacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS, type Settings } from '@/types/session';

const record = (car: CarKind, timeS: number): CarRecords => ({ bestS: timeS, bestSectors: [timeS / 3, timeS / 3, timeS / 3],
  laps: [{ car, timeS, sectorsS: [timeS / 3, timeS / 3, timeS / 3], valid: true, dateIso: '2026-10-08T00:00:00Z' }] });

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('records per driving level', () => {
  it('keeps Experienced on the key from before levels, so old records are Experienced records', () => {
    storage.set('bathurst.records.v2.camaro', JSON.stringify(record('camaro', 124)));
    expect(loadRecords('camaro', 'bathurst', 'experienced')?.bestS).toBe(124);
    expect(loadRecords('camaro')?.bestS).toBe(124);
    expect(loadRecords('camaro', 'bathurst', 'superstar')).toBeNull();
    expect(loadRecords('camaro', 'bathurst', 'casual')).toBeNull();
  });

  it('saves each level under its own key and never touches the others', () => {
    storage.set('bathurst.records.v2.camaro', JSON.stringify(record('camaro', 124)));
    saveRecords('camaro', record('camaro', 130), 'bathurst', 'superstar');
    saveRecords('camaro', record('camaro', 118), 'bathurst', 'casual');
    expect([...storage.keys()].sort()).toEqual(['bathurst.records.v2.camaro', 'bathurst.records.v2.camaro.casual', 'bathurst.records.v2.camaro.superstar']);
    expect(loadRecords('camaro', 'bathurst', 'experienced')?.bestS).toBe(124);
    expect(loadRecords('camaro', 'bathurst', 'superstar')?.bestS).toBe(130);
    expect(loadRecords('camaro', 'bathurst', 'casual')?.bestS).toBe(118);
  });

  it('shows the other cars’ best laps of the session’s level only', () => {
    saveRecords('mustang', record('mustang', 120), 'bathurst', 'experienced');
    saveRecords('mustang', record('mustang', 131), 'bathurst', 'superstar');
    const [, best, level] = sessionResults({ car: 'camaro', laps: [], sessionLaps: [], track: { id: 'bathurst' }, level: 'superstar' });
    expect(level).toBe('superstar');
    expect(best.mustang?.timeS).toBe(131);
  });
});

// ---- a session driven by a light stand-in car that moves along the track at a fixed speed

const track = new Track();
const line = { offset: new Float32Array(track.n) } as unknown as RacingLine;
const SPEED = 50; // m/s: a ~124 s Bathurst lap, above the plausible-lap floor
const DT = 1 / 30;

function standInCar() {
  const vehicle = {
    tp: { s: 0, index: 0 }, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, steerAngle: 0, speed: SPEED,
    wheels: [0, 1, 2, 3].map(() => ({ surface: 'road' })),
    stint: { refuels: 0, reset: () => {} }, trackGrip: { reset: () => {} },
    telemetry: { speed: SPEED, throttle: 1, brake: 0 },
  };
  const entity = { vehicle, reset: (s: number) => { vehicle.tp.s = s; }, repair: () => {} };
  return { vehicle, entity: entity as unknown as CarEntity };
}

function rules(level: keyof typeof LEVEL_PRESETS, extra: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS[level], ...extra };
}

/** Grid, lights out, then `seconds` of driving; `each` runs before every step. */
function drive(session: RaceSession, car: ReturnType<typeof standInCar>, seconds: number, each?: (t: number) => void): void {
  while (!session.racing) session.updateLights(0.1);
  for (let t = 0; t < seconds; t += DT) {
    each?.(t);
    car.vehicle.tp.s = track.wrapS(car.vehicle.tp.s + SPEED * DT);
    session.update(DT);
  }
}

const lapS = track.length / SPEED;

describe('a session records at the level its rules obey', () => {
  it('starts at the level of the rules and saves a flying lap there only', () => {
    const car = standInCar();
    const session = new RaceSession('camaro', track, line, car.entity, 'soft', rules('superstar'));
    session.placeOnGrid();
    expect(session.level).toBe('superstar');
    drive(session, car, lapS * 2.2);
    flushRecords();
    const flying = session.sessionLaps.find((l) => !l.standing);
    expect(flying).toMatchObject({ valid: true, level: 'superstar' });
    expect(storage.has('bathurst.records.v2.camaro.superstar')).toBe(true);
    expect(storage.has('bathurst.records.v2.camaro')).toBe(false);
  });

  it('moves to another level on the grid at once, with that level’s best lap', () => {
    saveRecords('camaro', record('camaro', 140), 'bathurst', 'superstar');
    const car = standInCar();
    const session = new RaceSession('camaro', track, line, car.entity, 'soft', rules('experienced'));
    session.placeOnGrid();
    session.setRules(rules('superstar'));
    expect(session.level).toBe('superstar');
    expect(session.timer.bestS).toBe(140);
  });

  it('invalidates a lap when the rules drop below its level, then counts the next laps at the new level', () => {
    const car = standInCar();
    const session = new RaceSession('camaro', track, line, car.entity, 'soft', rules('experienced'));
    session.placeOnGrid();
    // Through the standing lap, then halfway round the first flying lap the player turns on Casual help.
    drive(session, car, lapS * 3.2, (t) => { if (t > lapS * 1.5 && t < lapS * 1.5 + DT) session.setRules(rules('casual')); });
    flushRecords();
    const [standing, changed, next] = session.sessionLaps;
    expect(standing.standing).toBe(true);
    expect(changed).toMatchObject({ valid: false, level: 'experienced' });
    expect(next).toMatchObject({ valid: true, level: 'casual' });
    expect(session.level).toBe('casual');
    expect(loadRecords('camaro', 'bathurst', 'casual')?.bestS).toBeCloseTo(next.timeS, 6);
    expect(loadRecords('camaro', 'bathurst', 'experienced')?.bestS ?? Infinity).toBe(Infinity);
  });

  it('keeps an off-track lap valid with track limits off, and invalidates it with them on', () => {
    for (const trackLimits of [false, true]) {
      const car = standInCar();
      const session = new RaceSession('camaro', track, line, car.entity, 'soft', rules('casual', { trackLimits }));
      session.placeOnGrid();
      drive(session, car, lapS * 2.5, (t) => {
        const off = t > lapS * 1.4 && t < lapS * 1.4 + 1;
        for (const w of car.vehicle.wheels) w.surface = off ? 'grass' : 'road';
      });
      const flying = session.sessionLaps.find((l) => !l.standing)!;
      expect(flying.valid).toBe(!trackLimits);
    }
  });

  it('resets without invalidating when track limits are off (automatic recovery says Back on track)', () => {
    const car = standInCar();
    const session = new RaceSession('camaro', track, line, car.entity, 'soft', rules('casual'));
    session.placeOnGrid();
    drive(session, car, lapS * 1.3);
    session.resetToTrack('auto');
    expect(session.timer.valid).toBe(true);
    expect(session.currentMessage()?.text).toBe('BACK ON TRACK');
    session.setRules(rules('experienced'));
    session.resetToTrack();
    expect(session.timer.valid).toBe(false);
    expect(session.currentMessage()?.text).toBe('CAR RESET AND REPAIRED — LAP INVALIDATED');
  });
});
