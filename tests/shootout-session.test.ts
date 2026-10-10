import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarKind } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { competitionSettings } from '@/game/shootout-rules';
import type { ShootoutAttempt } from '@/shootout/model';
import { flushRecords } from '@/race/records-queue';
import type { RacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS, type RaceMode } from '@/types/session';

const track = new Track();
const line = { offset: new Float32Array(track.n) } as unknown as RacingLine;
const storage = new Map<string, string>();
const dt = 1 / 30;
const speed = 50;
const attempt: ShootoutAttempt = { id: '7cc474ed-5235-4b3c-8e98-c331bd097a0d', number: 1, car: 'camaro', online: true, startedAt: '2026-10-10T00:00:00Z' };

beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});
afterEach(() => { flushRecords(); vi.unstubAllGlobals(); });

function fixture(mode: RaceMode = 'shootoutTop10', car: CarKind = 'camaro', raceTrack = track) {
  const vehicle = {
    tp: { s: 0, index: 0 }, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, steerAngle: 0, speed,
    wheels: [0, 1, 2, 3].map(() => ({ surface: 'road' })),
    stint: { refuels: 0, reset() {} }, trackGrip: { reset() {} }, telemetry: { speed, throttle: 1, brake: 0 },
  };
  const entity = { vehicle, reset: (s: number) => { vehicle.tp.s = s; }, repair() {} } as unknown as CarEntity;
  const session = new RaceSession(car, raceTrack, line, entity, 'soft', competitionSettings(DEFAULT_SETTINGS), mode);
  session.placeOnGrid();
  while (!session.racing) session.updateLights(0.1);
  const step = (): void => { vehicle.tp.s = raceTrack.wrapS(vehicle.tp.s + speed * dt); session.update(dt); };
  const until = (phase: 'ready' | 'finished'): void => {
    for (let i = 0; i < 10_000 && session.shootout?.phase !== phase; i++) step();
    expect(session.shootout?.phase).toBe(phase);
  };
  const approachLine = (): void => {
    for (let i = 0; i < 10_000 && session.lapDist() < raceTrack.length - 2; i++) step();
    expect(session.lapDist()).toBeGreaterThanOrEqual(raceTrack.length - 2);
  };
  return { session, vehicle, step, until, approachLine };
}

describe('one warm-up and one Shootout lap', () => {
  it('requires a complete warm-up, then waits for a durable competition allocation', () => {
    const { session, step, until } = fixture();
    expect(session.shootout?.phase).toBe('warmup');
    expect(() => session.beginShootoutTimedLap(attempt)).toThrow(/warm-up/);
    for (let i = 0; i < 100; i++) step();
    expect(session.shootout?.phase).toBe('warmup');
    session.placeOnGrid();
    expect(session.shootout?.phase).toBe('warmup');
    while (!session.racing) session.updateLights(0.1);
    until('ready');
    const clock = session.timer.lapTime;
    session.update(20);
    expect(session.timer.lapTime).toBe(clock);
    expect(() => session.beginShootoutTimedLap(null)).toThrow(/saved/);
    session.beginShootoutTimedLap(attempt);
    expect(session.shootout).toEqual({ phase: 'timed', attempt });
    expect(session.shootoutRemaining).toBe(2);
  });

  it('stops after exactly one flying lap and never writes time-trial records', () => {
    const { session, until } = fixture();
    until('ready');
    session.beginShootoutTimedLap(attempt);
    until('finished');
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt, outcome: { kind: 'valid', timeS: expect.closeTo(track.length / speed, 6) } });
    const run = session.shootout;
    session.update(120);
    expect(session.shootout).toBe(run);
    expect(session.sessionLaps).toHaveLength(0);
    flushRecords();
    expect([...storage.keys()]).toHaveLength(0);
    expect(() => session.placeOnGrid()).toThrow(/cannot be restarted/);
  });

  it('does not count a short reverse-and-recross as a warm-up', () => {
    const { session, vehicle } = fixture();
    vehicle.tp.s = track.wrapS(track.startLineS - 1);
    session.timer.startOutLap(session.lapDist());
    vehicle.tp.s = track.wrapS(track.startLineS + 1);
    session.update(dt);
    expect(session.shootout?.phase).toBe('warmup');
  });

  it('ends a short timed recross as invalid instead of giving a replacement timed lap', () => {
    const { session, vehicle, until } = fixture();
    until('ready');
    session.beginShootoutTimedLap(attempt);
    vehicle.tp.s = track.wrapS(track.startLineS - 1); session.update(dt);
    vehicle.tp.s = track.wrapS(track.startLineS + 1); session.update(dt);
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt, outcome: { kind: 'invalid', timeS: null } });
  });

  it('restarts a warm-up for free but preserves the allocated attempt when a timed lap is reset', () => {
    const { session, until } = fixture();
    session.resetToTrack();
    expect(session.shootout).toEqual({ phase: 'warmup' });
    expect(session.currentMessage()?.text).toContain('NO ATTEMPT USED');
    while (!session.racing) session.updateLights(0.1);
    until('ready');
    session.beginShootoutTimedLap(attempt);
    session.resetToTrack();
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt, outcome: { kind: 'invalid', reason: expect.stringContaining('attempt is used') } });
  });

  it('rejects an off-track flying lap and a run assisted by verification tools', () => {
    for (const verification of [false, true]) {
      const { session, vehicle, until, step } = fixture();
      until('ready');
      session.beginShootoutTimedLap(attempt);
      if (verification) session.invalidateShootout('Verification driving cannot enter the competition.');
      else {
        for (const wheel of vehicle.wheels) wheel.surface = 'grass';
        for (let i = 0; i < 10; i++) step();
        for (const wheel of vehicle.wheels) wheel.surface = 'road';
      }
      until('finished');
      expect(session.shootout).toMatchObject({ phase: 'finished', outcome: { kind: 'invalid' } });
    }
  });

  it('allows an Arcade flying lap without a competition allocation', () => {
    const { session, until } = fixture('shootoutArcade');
    until('ready');
    session.beginShootoutTimedLap(null);
    until('finished');
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt: null, outcome: { kind: 'valid' } });
    expect(session.shootoutRemaining).toBeNull();
    flushRecords(); expect(storage.size).toBe(0);
  });

  it.each(['shootoutTop10', 'shootoutArcade'] as const)('ends a %s warm-up at 600 seconds without using an attempt', (mode) => {
    const { session } = fixture(mode);
    session.update(599);
    expect(session.shootout?.phase).toBe('warmup');
    session.update(1);
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt: null, outcome: { kind: 'invalid', timeS: null, reason: expect.stringContaining('10-minute lap limit reached') } });
    if (session.shootout?.phase !== 'finished' || session.shootout.outcome.kind !== 'invalid') throw new Error('Expected an invalid timeout result.');
    expect(session.shootout.outcome.reason).toContain('No score');
    expect(session.shootout.outcome.reason).toContain('No competition attempt used');
    if (mode === 'shootoutArcade') expect(session.shootout.outcome.reason).toContain('practice remains unlimited');
    expect(session.shootoutRemaining).toBeNull();
    expect(session.waitingForShootout).toBe(true);
    expect(session.timer.valid).toBe(false);
    expect(session.timer.lapTime).toBe(600);
    const run = session.shootout;
    session.update(120);
    expect(session.shootout).toBe(run);
    expect(session.timer.lapTime).toBe(600);
    flushRecords(); expect(storage.size).toBe(0);
  });

  it.each(['shootoutTop10', 'shootoutArcade'] as const)('ends a %s flying lap at 600 seconds and preserves its allocation', (mode) => {
    const { session, until } = fixture(mode);
    until('ready');
    const allocated = mode === 'shootoutTop10' ? attempt : null;
    session.beginShootoutTimedLap(allocated);
    session.update(599 - session.timer.lapTime);
    expect(session.shootout?.phase).toBe('timed');
    session.update(1);
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt: allocated, outcome: { kind: 'invalid', timeS: null, reason: expect.stringContaining('10-minute lap limit reached') } });
    if (session.shootout?.phase !== 'finished' || session.shootout.outcome.kind !== 'invalid') throw new Error('Expected an invalid timeout result.');
    expect(session.shootout.outcome.reason).toContain('No score');
    expect(session.shootout.outcome.reason).toContain(mode === 'shootoutTop10' ? 'attempt is used' : 'practice remains unlimited');
    expect(session.shootoutRemaining).toBe(mode === 'shootoutTop10' ? 2 : null);
    expect(session.waitingForShootout).toBe(true);
    expect(session.timer.valid).toBe(false);
    expect(session.timer.lapTime).toBe(600);
    const run = session.shootout;
    session.update(120);
    expect(session.shootout).toBe(run);
    expect(session.timer.lapTime).toBe(600);
  });

  it.each(['warmup', 'timed'] as const)('accepts a completed %s lap before 600 seconds on a frame that passes the limit', (phase) => {
    const { session, vehicle, until, approachLine } = fixture();
    if (phase === 'timed') { until('ready'); session.beginShootoutTimedLap(attempt); }
    approachLine();
    const before = track.length - session.lapDist();
    session.timer.lapTime = 599.75;
    vehicle.tp.s = track.wrapS(track.startLineS + before * 9);
    const completed = session.update(1);
    expect(completed?.timeS).toBeCloseTo(599.85, 6);
    if (phase === 'warmup') expect(session.shootout).toEqual({ phase: 'ready' });
    else expect(session.shootout).toMatchObject({ phase: 'finished', attempt, outcome: { kind: 'valid', timeS: expect.closeTo(599.85, 6) } });
  });

  it.each(['warmup', 'timed'] as const)('times out a completed %s lap that crosses at 600 seconds', (phase) => {
    const { session, vehicle, until, approachLine } = fixture();
    if (phase === 'timed') { until('ready'); session.beginShootoutTimedLap(attempt); }
    approachLine();
    const before = track.length - session.lapDist();
    session.timer.lapTime = 599.5;
    vehicle.tp.s = track.wrapS(track.startLineS + before);
    expect(session.update(1)?.timeS).toBeCloseTo(600, 6);
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt: phase === 'timed' ? attempt : null, outcome: { kind: 'invalid', timeS: null, reason: expect.stringContaining('10-minute lap limit reached') } });
    expect(session.timer.lapTime).toBe(600);
  });

  it('does not let a short recross erase a warm-up timeout', () => {
    const { session, vehicle } = fixture();
    vehicle.tp.s = track.wrapS(track.startLineS - 1);
    session.timer.startOutLap(session.lapDist());
    session.timer.startStandingLap();
    session.timer.lapTime = 599.9;
    vehicle.tp.s = track.wrapS(track.startLineS + 1);
    expect(session.update(0.2)).toBeNull();
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt: null, outcome: { kind: 'invalid', reason: expect.stringContaining('10-minute lap limit reached') } });
  });

  it('rejects a completed Top 10 lap outside the plausible competition range', () => {
    const { session, vehicle, until } = fixture();
    until('ready');
    session.beginShootoutTimedLap(attempt);
    for (let i = 0; i < 10_000 && session.shootout?.phase !== 'finished'; i++) {
      vehicle.tp.s = track.wrapS(vehicle.tp.s + speed * dt);
      session.update(dt / 4);
    }
    expect(session.shootout).toMatchObject({ phase: 'finished', attempt, outcome: { kind: 'invalid', timeS: expect.closeTo(track.length / (speed * 4), 1), reason: expect.stringContaining('competition') } });
  });

  it('keeps time-trial laps running past the Shootout limit', () => {
    const { session } = fixture('timeTrial');
    session.update(600);
    expect(session.shootout).toBeNull();
    expect(session.waitingForShootout).toBe(false);
    session.update(1);
    expect(session.timer.lapTime).toBe(601);
  });

  it('restricts both Shootout modes to Bathurst and the three eligible cars', () => {
    for (const mode of ['shootoutTop10', 'shootoutArcade'] as const) {
      expect(() => fixture(mode, 'torana')).toThrow(/Bathurst/);
      const otherTrack = Object.assign(Object.create(track), { id: 'adelaide' }) as Track;
      expect(() => fixture(mode, 'camaro', otherTrack)).toThrow(/Bathurst/);
    }
  });

  it('uses full damage, track limits and the pro preset without mutating saved preferences', () => {
    const preferences = { ...DEFAULT_SETTINGS, damage: 'off' as const, trackLimits: false, touchAutoThrottle: true };
    expect(competitionSettings(preferences)).toMatchObject({ damage: 'full', trackLimits: true, wear: true, autoGears: false, abs: false, tractionControl: false, racingLine: 'off', steeringAssist: false, autoRecover: false, touchAutoThrottle: false });
    expect(preferences).toMatchObject({ damage: 'off', trackLimits: false, autoGears: true, touchAutoThrottle: true });
  });
});
