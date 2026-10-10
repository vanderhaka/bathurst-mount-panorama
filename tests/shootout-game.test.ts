// Game-level Shootout behaviour on a partial Game (no WebGL): the store, replay codec and board are mocked, since
// src/shootout implements them separately.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { competitionSettings, RealLapClock } from '@/game/shootout-rules';
import type { ShootoutAttempt } from '@/shootout/model';
import type { RacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS, type RaceMode } from '@/types/session';

const store = vi.hoisted(() => ({
  reserveTimedLap: vi.fn(), allocateInBackground: vi.fn(), saveReplay: vi.fn(), complete: vi.fn(),
  snapshot: vi.fn(() => ({ remaining: 3, attempts: [], nickname: '', writable: true })),
}));
const board = vi.hoisted(() => ({ fetchReplay: vi.fn(), fetchBoard: vi.fn() }));
vi.mock('@/shootout/store', () => ({ ShootoutStore: class { constructor() { return store; } } }));
vi.mock('@/shootout/leaderboard', () => board);
vi.mock('@/shootout/model', async (load) => ({ ...await load<typeof import('@/shootout/model')>(), encodeReplay: vi.fn((frames: Float32Array) => `replay:${frames.length}`) }));

const { Game, warnBeforeUnload } = await import('@/game/game');

const track = new Track();
const line = { offset: new Float32Array(track.n) } as unknown as RacingLine;
const speed = 50, dt = 1 / 30;
const attempt: ShootoutAttempt = { id: '7cc474ed-5235-4b3c-8e98-c331bd097a0d', number: 1, car: 'camaro', online: false, startedAt: '2026-10-10T00:00:00Z' };
const storage = new Map<string, string>();

function session(mode: RaceMode = 'shootoutTop10') {
  const vehicle = {
    tp: { s: 0, index: 0 }, x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, steerAngle: 0, speed, vx: 0, vy: 0, vz: 0,
    pt: { gear: 1 }, spec: { gearRatios: [3, 2, 1] }, wheels: [0, 1, 2, 3].map(() => ({ surface: 'road' })),
    stint: { refuels: 0, reset() {} }, trackGrip: { reset() {} }, telemetry: { speed, throttle: 1, brake: 0 },
  };
  const entity = { vehicle, reset: (s: number) => { vehicle.tp.s = s; }, repair() {} } as unknown as CarEntity;
  const s = new RaceSession('camaro', track, line, entity, 'soft', competitionSettings(DEFAULT_SETTINGS), mode);
  s.placeOnGrid();
  while (!s.racing) s.updateLights(0.1);
  const until = (phase: 'ready' | 'finished'): void => {
    for (let i = 0; i < 20_000 && s.shootout?.phase !== phase; i++) { vehicle.tp.s = track.wrapS(vehicle.tp.s + speed * dt); s.update(dt); }
    expect(s.shootout?.phase).toBe(phase);
  };
  return { session: s, until };
}

interface PartialGame {
  state: string; race: unknown; lapClock: RealLapClock;
  startShootoutLap(race: unknown): Promise<void>; finishShootout(s: RaceSession): void; raceFrame(dt: number): void;
  pause(): void; resume(): void; loadPractice(s: RaceSession, car: 'camaro'): void; endRace(): void;
}

function game(s: RaceSession) {
  const parts = {
    menus: { showShootoutResult: vi.fn(), showPause: vi.fn(), syncSettings: vi.fn(), hide: vi.fn(), isOpen: () => false },
    audio: { suspend: vi.fn(), resume: vi.fn(), dispose: vi.fn() }, graphics: { settle: vi.fn() }, rig: { snap: vi.fn(), cycle: vi.fn(), lookBack: false },
    hud: { setVisible: vi.fn() }, input: { consume: vi.fn((key: string) => key === 'reset'), isHeld: () => false },
  };
  const race = { session: s, restart: vi.fn(), resetToTrack: vi.fn(), frame: vi.fn(), player: { model: { root: {}, dispose: vi.fn() } } };
  const g = Object.assign(Object.create(Game.prototype) as object, {
    state: 'race', halted: false, claimingShootout: false, shootoutStore: store, lapClock: new RealLapClock(), race,
    settings: { ...DEFAULT_SETTINGS }, timeScale: 1, hudHidden: false, stage: { scene: { remove() {} } }, lineMesh: { mesh: {} },
    followCamera: vi.fn(), rememberSettings: vi.fn(), ...parts,
  }) as unknown as PartialGame;
  return { g, race, ...parts };
}

let listeners: Array<[string, unknown]>;
beforeEach(() => {
  listeners = [];
  storage.clear();
  vi.stubGlobal('addEventListener', (type: string, fn: unknown) => listeners.push([type, fn]));
  vi.stubGlobal('removeEventListener', (type: string, fn: unknown) => { listeners = listeners.filter(([t, f]) => t !== type || f !== fn); });
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
  for (const fn of [...Object.values(store), ...Object.values(board)]) fn.mockReset();
  store.snapshot.mockReturnValue({ remaining: 3, attempts: [], nickname: '', writable: true });
  store.reserveTimedLap.mockResolvedValue(attempt);
  store.allocateInBackground.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('Top 10 start at the line', () => {
  it('reserves locally, keeps racing (no loading screen), allocates in the background and guards unload', async () => {
    const { session: s, until } = session();
    until('ready');
    const { g, race, menus, audio } = game(s);
    await g.startShootoutLap(race);
    expect(store.reserveTimedLap).toHaveBeenCalledWith('camaro');
    expect(store.allocateInBackground).toHaveBeenCalledWith(attempt.id);
    expect(s.shootout).toEqual({ phase: 'timed', attempt });
    expect(g.state).toBe('race');
    expect(audio.suspend).not.toHaveBeenCalled();
    expect(menus.hide).not.toHaveBeenCalled();
    expect(g.lapClock.running).toBe(true);
    expect(listeners).toEqual([['beforeunload', warnBeforeUnload]]);
    const event = { preventDefault: vi.fn(), returnValue: 'x' } as unknown as BeforeUnloadEvent;
    warnBeforeUnload(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('keeps the warm-up when the reservation fails, with the reason on screen', async () => {
    const { session: s, until } = session();
    until('ready');
    store.reserveTimedLap.mockRejectedValue(new Error('No attempts left this week.'));
    const { g, race } = game(s);
    await g.startShootoutLap(race);
    expect(s.shootout).toEqual({ phase: 'warmup' });
    expect(s.currentMessage()?.text).toBe('No attempts left this week.');
    expect(listeners).toEqual([]);
    expect(store.allocateInBackground).not.toHaveBeenCalled();
  });

  it('survives a background allocation that rejects', async () => {
    const { session: s, until } = session();
    until('ready');
    store.allocateInBackground.mockRejectedValue(new Error('offline'));
    const { g, race } = game(s);
    await g.startShootoutLap(race);
    await Promise.resolve();
    expect(s.shootout?.phase).toBe('timed');
  });
});

describe('Top 10 timed lap', () => {
  async function timed() {
    const { session: s, until } = session();
    until('ready');
    const parts = game(s);
    await parts.g.startShootoutLap(parts.race);
    return { s, until, ...parts };
  }

  it('ignores the reset key and says how to end the attempt', async () => {
    const { s, g, race } = await timed();
    g.raceFrame(1 / 60);
    expect(race.resetToTrack).not.toHaveBeenCalled();
    expect(s.currentMessage()?.text).toBe('PAUSE TO END THE ATTEMPT');
    expect(s.shootout?.phase).toBe('timed');
  });

  it('still resets in the warm-up', () => {
    const { session: s } = session();
    const { g, race } = game(s);
    g.raceFrame(1 / 60);
    expect(race.resetToTrack).toHaveBeenCalledOnce();
  });

  it('pauses the real-time clock with the game', async () => {
    const { g } = await timed();
    vi.spyOn(performance, 'now').mockReturnValue(1e9);
    g.pause();
    expect(g.state).toBe('paused');
    const paused = g.lapClock.elapsedS(1e9);
    expect(g.lapClock.elapsedS(1e9 + 60_000)).toBe(paused);
    vi.spyOn(performance, 'now').mockReturnValue(1e9 + 60_000);
    g.resume();
    expect(g.state).toBe('race');
    expect(g.lapClock.elapsedS(1e9 + 61_000)).toBeCloseTo(paused! + 1, 6);
    vi.restoreAllMocks();
  });

  it('saves the replay with a valid result before showing it, and removes the unload guard', async () => {
    const { s, until, g, menus } = await timed();
    until('finished');
    g.finishShootout(s);
    expect(store.complete).toHaveBeenCalledWith(attempt.id, expect.objectContaining({ kind: 'valid' }));
    expect(store.saveReplay).toHaveBeenCalledWith(attempt.id, expect.stringMatching(/^replay:\d+$/));
    expect(store.complete.mock.invocationCallOrder[0]).toBeLessThan(store.saveReplay.mock.invocationCallOrder[0]);
    expect(store.saveReplay.mock.invocationCallOrder[0]).toBeLessThan(menus.showShootoutResult.mock.invocationCallOrder[0]);
    expect(menus.showShootoutResult).toHaveBeenCalledWith('shootoutTop10', attempt, expect.objectContaining({ kind: 'valid' }), undefined, undefined);
    expect(listeners).toEqual([]);
    expect(g.lapClock.running).toBe(false);
  });

  it('never loses the result when the replay cannot be saved', async () => {
    const { s, until, g, menus } = await timed();
    until('finished');
    store.saveReplay.mockImplementation(() => { throw new Error('quota'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    g.finishShootout(s);
    expect(menus.showShootoutResult).toHaveBeenCalledWith('shootoutTop10', attempt, expect.objectContaining({ kind: 'valid' }), undefined, undefined);
    vi.restoreAllMocks();
  });

  it('removes the unload guard when the race ends early, and the abandoned attempt stays used', async () => {
    const { s, g } = await timed();
    expect(listeners).toHaveLength(1);
    g.endRace();
    expect(listeners).toEqual([]);
    expect(store.complete).toHaveBeenCalledWith(attempt.id, expect.objectContaining({ kind: 'invalid' }));
    expect(store.saveReplay).not.toHaveBeenCalled();
    expect(s.shootout?.phase).toBe('finished');
  });
});

describe('Arcade practice', () => {
  it('chases the current #1 ghost when it loads, else the player\'s own best', async () => {
    const { session: s } = session('shootoutArcade');
    const { g } = game(s);
    const frames = new Float32Array(8 * 30);
    board.fetchReplay.mockResolvedValue({ car: 'camaro', timeS: 125.5, frames });
    const set = vi.spyOn(s, 'setPracticeReference');
    g.loadPractice(s, 'camaro');
    expect(board.fetchReplay).toHaveBeenCalledWith('camaro', 1);
    expect(set).toHaveBeenLastCalledWith(null, null, 'GHOST: YOUR BEST');
    await vi.waitFor(() => expect(set).toHaveBeenLastCalledWith(frames, null, 'GHOST: CURRENT #1 2:05.500'));
    board.fetchReplay.mockRejectedValue(new Error('not implemented'));
    set.mockClear();
    g.loadPractice(s, 'camaro');
    await Promise.resolve(); await Promise.resolve();
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('keeps a best per car and shows each lap against it at the line', () => {
    const run = () => {
      const { session: s, until } = session('shootoutArcade');
      until('ready');
      s.beginShootoutTimedLap(null);
      until('finished');
      const { g, menus } = game(s);
      g.finishShootout(s);
      return menus.showShootoutResult.mock.calls[0][4] as { bestS: number; deltaS: number | null; improved: boolean };
    };
    const first = run();
    expect(first).toMatchObject({ improved: true, deltaS: null, bestS: expect.closeTo(track.length / speed, 3) });
    expect(JSON.parse(storage.get('bathurst.shootoutArcade.best.v1.camaro')!)).toMatchObject({ timeS: first.bestS, ghost: expect.any(String) });
    const second = run();
    expect(second).toMatchObject({ improved: false, deltaS: expect.closeTo(0, 3), bestS: first.bestS });
    expect(store.saveReplay).not.toHaveBeenCalled();
  });
});
