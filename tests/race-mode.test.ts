import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarKind } from '@/car/car-specs';
import { circuitCarSpec } from '@/car/car-specs';
import { CarEntity } from '@/game/car-entity';
import { OpponentField } from '@/game/opponent-field';
import { RaceSession } from '@/game/race-session';
import type { VehicleInput } from '@/physics/types';
import { loadRecords } from '@/race/records';
import { queueRecordsSave } from '@/race/records-queue';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine, type RacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import type { CarModel } from '@/types/car-model';
import { LEVEL_PRESETS } from '@/race/driving-levels';
import { DEFAULT_SETTINGS, isShootoutMode, type RaceMode } from '@/types/session';

vi.mock('@/race/records', async (orig) => ({ ...await orig<typeof import('@/race/records')>(), loadRecords: vi.fn(() => null) }));
vi.mock('@/race/records-queue', () => ({ queueRecordsSave: vi.fn(), flushRecords: vi.fn() }));

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.mocked(loadRecords).mockClear();
  vi.mocked(queueRecordsSave).mockClear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
});
afterEach(() => vi.unstubAllGlobals());

describe('isShootoutMode', () => {
  it('is true for the two Shootout modes only', () => {
    expect(isShootoutMode('shootoutArcade')).toBe(true);
    expect(isShootoutMode('shootoutTop10')).toBe(true);
    expect(isShootoutMode('timeTrial')).toBe(false);
    expect(isShootoutMode('race')).toBe(false);
  });
});

const adelaide = createAdelaideTrack();

function fakeSession(mode: RaceMode, car: CarKind, track: Track, rules = DEFAULT_SETTINGS) {
  const speed = 50;
  const vehicle = {
    tp: { s: 0, index: 0 }, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, steerAngle: 0, speed, vx: 0, vy: 0, vz: 0, pt: { gear: 1 },
    wheels: [0, 1, 2, 3].map(() => ({ surface: 'road' })), stint: { refuels: 0, reset() {} }, trackGrip: { reset() {} }, telemetry: { speed, throttle: 1, brake: 0 },
  };
  const entity = { vehicle, reset: (s: number) => { vehicle.tp.s = s; }, repair() {} } as unknown as CarEntity;
  const line = { offset: new Float32Array(track.n) } as unknown as RacingLine;
  const session = new RaceSession(car, track, line, entity, 'soft', rules, mode);
  return { session, vehicle };
}

describe('RaceSession in mode race', () => {
  it('accepts every circuit and car (the Shootout guard is Bathurst Gen3 only)', () => {
    expect(() => fakeSession('race', 'torana', adelaide)).not.toThrow();
    expect(() => fakeSession('shootoutTop10', 'torana', adelaide)).toThrow(/Shootout requires/);
    expect(() => fakeSession('shootoutArcade', 'camaro', adelaide)).toThrow(/Shootout requires/);
  });

  it('has no Shootout run, and the Shootout hooks do nothing', () => {
    const { session } = fakeSession('race', 'torana', adelaide);
    session.placeOnGrid();
    expect(session.shootout).toBeNull();
    expect(session.waitingForShootout).toBe(false);
    session.invalidateShootout('x');
    expect(session.timer.valid).toBe(true);
  });

  it('puts the player in the race slot', () => {
    const { session, vehicle } = fakeSession('race', 'torana', adelaide);
    session.raceSlot = { s: 123, d: 2 };
    session.placeOnGrid();
    expect(vehicle.tp.s).toBe(123);
  });

  it('never loads or saves records, ghosts or best laps, through a rule change and a whole lap', () => {
    const casual = { ...DEFAULT_SETTINGS, ...LEVEL_PRESETS.casual };
    const { session, vehicle } = fakeSession('race', 'torana', adelaide);
    session.placeOnGrid();
    session.setRules(casual); // moves the level on the grid: a time trial would read that level's records
    while (!session.racing) session.updateLights(0.1);
    session.setRules(DEFAULT_SETTINGS);
    for (let i = 0; i < 20_000 && session.sessionLaps.length < 2; i++) {
      vehicle.tp.s = adelaide.wrapS(vehicle.tp.s + 50 / 30);
      session.update(1 / 30);
    }
    expect(session.sessionLaps.length).toBeGreaterThanOrEqual(2);
    expect(loadRecords).not.toHaveBeenCalled();
    expect(queueRecordsSave).not.toHaveBeenCalled();
    expect(session.records).toBeNull();
    expect(session.ghost).toBeNull();
    expect(session.ghostVisible).toBe(false);
    expect(session.laps).toHaveLength(0);
    expect([...storage.keys()]).toEqual([]);
    expect(session.currentMessage()?.text ?? '').not.toMatch(/BEST|INVALID/);
  });

  it('does not invalidate laps for track limits or reset the car on the grid', () => {
    const { session, vehicle } = fakeSession('race', 'torana', adelaide);
    session.placeOnGrid();
    session.resetToTrack();
    expect(session.currentMessage()).toBeNull();
    while (!session.racing) session.updateLights(0.1);
    vehicle.wheels.forEach((w) => { w.surface = 'grass'; });
    for (let i = 0; i < 30; i++) session.update(0.1);
    expect(session.timer.valid).toBe(true);
    session.resetToTrack();
    expect(session.timer.valid).toBe(true);
    expect(session.currentMessage()?.text).toBe('CAR RESET AND REPAIRED');
  });

  it('keeps time trial reading records (the control for the checks above)', () => {
    fakeSession('timeTrial', 'camaro', adelaide);
    expect(loadRecords).toHaveBeenCalled();
  });
});

describe('OpponentField', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const scene = new THREE.Scene();
  const createModel = (): CarModel => {
    const target = { root: new THREE.Group(), dispose: vi.fn() } as Record<string, unknown>;
    return new Proxy(target, { get: (t, k: string) => (k in t ? t[k] : () => {}) }) as unknown as CarModel;
  };
  const input = (): VehicleInput => ({ throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false, hold: true });

  function build(opponents: number) {
    const entity = new CarEntity(circuitCarSpec('camaro', track.id), track, kerbs, createModel, { primary: 1, secondary: 2, accent: 3, number: 97, banner: 'X', pattern: 'stripes' });
    const field = new OpponentField({ track, line, kerbs, scene, createModel }, { entity, car: 'camaro', liveryIndex: 0, livery: entity.livery }, { opponents, laps: 3, skill: 'medium' }, 11);
    entity.reset(field.playerSlot.s, field.playerSlot.d);
    field.placeOnGrid();
    return { entity, field };
  }

  it('lines the AI cars up in front of the player and holds them until the lights go out', () => {
    const { entity, field } = build(3);
    expect(field.cars).toHaveLength(4);
    expect(field.entities).toHaveLength(3);
    const standings = field.order.standings();
    expect(standings.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(standings[3].runner.isPlayer).toBe(true);
    const before = field.cars.map((v) => [v.x, v.z]);
    for (let i = 0; i < 90; i++) { entity.simulate(input(), 1 / 60); field.step(1 / 60, false); }
    field.cars.forEach((v, i) => { expect(Math.hypot(v.x - before[i][0], v.z - before[i][1])).toBeLessThan(0.3); });
    expect(field.clock).toBe(0);
    expect(field.hud()).toMatchObject({ position: 4, total: 4, lap: 1, laps: 3, finished: false });
  });

  it('drives the AI cars away on the lights, ahead of the held player, and restarts clean', () => {
    const { entity, field } = build(3);
    for (let i = 0; i < 60 * 8; i++) { entity.simulate(input(), 1 / 60); field.step(1 / 60, true); }
    expect(field.clock).toBeCloseTo(8, 1);
    expect(field.entities.every((e) => e.vehicle.speed > 20)).toBe(true);
    const rows = field.rows();
    expect(rows[3].isPlayer).toBe(true);
    expect(rows.slice(0, 3).every((r) => !r.isPlayer)).toBe(true);
    expect(field.takeFinish()).toBe(0);
    expect(field.resultDue).toBe(false);
    field.placeOnGrid();
    expect(field.clock).toBe(0);
    expect(field.order.standings().map((s) => s.index)).toEqual([0, 1, 2, 3]);
    field.dispose();
  });
});
