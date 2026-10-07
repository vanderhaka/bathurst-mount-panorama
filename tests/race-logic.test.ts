import { describe, expect, it } from 'vitest';
import { decodeGhost, encodeGhost, GHOST_RATE, GhostPlayer, GhostRecorder, type GhostPose } from '@/race/ghost';
import { LapTimer } from '@/race/lap-timer';
import { loadRecords, saveRecords } from '@/race/records';

const L = 6213;

/** Drives a timer at constant speed for one or more laps. */
function run(timer: LapTimer, startDist: number, speed: number, seconds: number, dt = 1 / 60) {
  let d = startDist;
  const results = [];
  for (let t = 0; t < seconds; t += dt) {
    d = (d + speed * dt) % L;
    const r = timer.update(dt, d);
    if (r) results.push(r);
  }
  return { results, dist: d };
}

describe('LapTimer', () => {
  it('times a flying lap to within one frame', () => {
    const timer = new LapTimer(L, [2453, 3973]);
    timer.startOutLap(L - 100);
    const speed = L / 120; // a 2:00.000 lap
    const { results } = run(timer, L - 100, speed, 125);
    expect(results.length).toBe(1);
    expect(results[0].timeS).toBeCloseTo(120, 1);
    expect(results[0].valid).toBe(true);
    const sum = results[0].sectorsS.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(results[0].timeS, 2);
    expect(timer.bestS).toBeCloseTo(120, 1);
  });

  it('marks an invalidated lap invalid and does not make it the best', () => {
    const timer = new LapTimer(L, [2453, 3973]);
    timer.startOutLap(L - 50);
    const { dist } = run(timer, L - 50, L / 120, 30);
    timer.invalidate();
    const { results } = run(timer, dist, L / 120, 100);
    expect(results[0].valid).toBe(false);
    expect(timer.bestS).toBeNull();
  });

  it('reports a live delta against the best lap and colours sectors', () => {
    const timer = new LapTimer(L, [2453, 3973]);
    timer.startOutLap(L - 50);
    const a = run(timer, L - 50, L / 120, 121);
    expect(a.results.length).toBe(1);
    // Next lap 2 % faster: delta must be negative and sectors personal/overall best.
    const b = run(timer, a.dist, (L / 120) * 1.02, 30);
    const snap = timer.snapshot(b.dist);
    expect(snap.deltaS).not.toBeNull();
    expect(snap.deltaS!).toBeLessThan(0);
    const c = run(timer, b.dist, (L / 120) * 1.02, 40);
    const snap2 = timer.snapshot(c.dist);
    expect(snap2.sectors[0].state).toBe('overallBest');
  });

  it('does not count reversing over the line and back as a lap', () => {
    const timer = new LapTimer(L, [2453, 3973]);
    timer.startOutLap(150);
    timer.startStandingLap(); // lights out on the grid, 150 m past the line
    let d = 150;
    const results = [];
    for (let k = 0; k < 600; k++) { d = (d - 0.5 + L) % L; const r = timer.update(1 / 60, d); if (r) results.push(r); } // reverse 300 m
    for (let k = 0; k < 600; k++) { d = (d + 0.6) % L; const r = timer.update(1 / 60, d); if (r) results.push(r); } // forward over the line
    expect(results).toHaveLength(0);
    expect(timer.bestS).toBeNull();
    expect(timer.lapNumber).toBe(1);
    expect(timer.crossings).toBe(1);
    // The restarted lap still times a full lap normally.
    const { results: full } = run(timer, d, L / 120, 122);
    expect(full).toHaveLength(1);
    expect(full[0].timeS).toBeGreaterThan(118);
    expect(full[0].timeS).toBeLessThan(122);
    expect(full[0].valid).toBe(true);
    expect(timer.bestS).toBeCloseTo(full[0].timeS, 3);
  });

  it('never makes the standing-start lap the best lap', () => {
    const timer = new LapTimer(L, [2453, 3973]);
    timer.startOutLap(150);
    timer.startStandingLap(); // lights out on the grid, 150 m past the line
    const a = run(timer, 150, L / 120, 120);
    expect(a.results).toHaveLength(1);
    expect(a.results[0].standing).toBe(true);
    expect(timer.bestS).toBeNull();
    expect(timer.delta(100)).toBeNull();
    const b = run(timer, a.dist, L / 120, 122);
    expect(b.results).toHaveLength(1);
    expect(b.results[0].standing).toBe(false);
    expect(timer.bestS).toBeCloseTo(b.results[0].timeS, 3);
  });

  it('does not count a lap shortened by a teleport', () => {
    const timer = new LapTimer(L, [2453, 3973]);
    timer.startOutLap(L - 50);
    const a = run(timer, L - 50, L / 120, 10); // over the line: lap 1 starts
    expect(timer.lapNumber).toBe(1);
    const b = run(timer, L - 200, L / 120, 10); // teleported to 200 m before the line
    expect([...a.results, ...b.results]).toHaveLength(0);
    expect(timer.lapNumber).toBe(1);
    expect(timer.bestS).toBeNull();
  });

  it('restores a saved best and its delta trace', () => {
    const t1 = new LapTimer(L, [2453, 3973]);
    t1.startOutLap(L - 50);
    run(t1, L - 50, L / 120, 125);
    const saved = t1.saveData();
    expect(saved?.bestS).toBeCloseTo(120, 1);
    const t2 = new LapTimer(L, [2453, 3973], saved);
    expect(t2.bestS).toBeCloseTo(120, 1);
  });
});

describe('Ghost', () => {
  const pose = (t: number): GhostPose => ({ x: t * 10, y: 1, z: -t * 5, heading: 0.1 * t, pitch: 0, roll: 0, steer: 0.05, speed: 10 });

  it('records at a fixed rate and replays by lap time', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 10; t += 1 / 120) rec.record(1 / 120, pose(t));
    const data = rec.take();
    const player = new GhostPlayer(data);
    expect(player.duration).toBeGreaterThan(9.5);
    const out = pose(0);
    expect(player.poseAt(5, out)).toBe(true);
    expect(out.x).toBeCloseTo(50, 0);
    expect(out.z).toBeCloseTo(-25, 0);
    expect(player.poseAt(60, out)).toBe(false);
    expect(GHOST_RATE).toBe(30);
  });

  it('records exactly GHOST_RATE samples per second with uneven frame steps', () => {
    const rec = new GhostRecorder();
    let t = 0;
    const steps = [1 / 60, 1 / 144, 1 / 50, 1 / 75, 1 / 120];
    for (let k = 0; t < 135.31; k++) {
      const dt = steps[k % steps.length];
      rec.record(dt, pose(t));
      t += dt;
    }
    const player = new GhostPlayer(rec.take());
    expect(Math.abs(player.duration - 135.31)).toBeLessThan(0.05);
  });

  it('survives a base64 round trip (localStorage)', () => {
    const data = Float32Array.from([1.5, -2.25, 3, 4, 5, 6, 7, 8]);
    const back = decodeGhost(encodeGhost(data));
    expect(Array.from(back!)).toEqual(Array.from(data));
    expect(decodeGhost('not base64 !!')).toBeNull();
  });
});

describe('Records', () => {
  it('drops impossible bests and ghosts that do not match the best lap', () => {
    const store = new Map<string, string>();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const ghost = new Float32Array(8 * GHOST_RATE * 130); // 130 s of frames
    saveRecords('camaro', { bestS: 18.4, bestSectors: [5, 6, 7.4], ghost, laps: [] });
    expect(loadRecords('camaro')?.bestS).toBe(Infinity);
    saveRecords('camaro', { bestS: 135, bestSectors: [50, 40, 45], ghost, laps: [] });
    expect(loadRecords('camaro')?.ghost).toBeUndefined();
    saveRecords('camaro', { bestS: 130.2, bestSectors: [50, 40, 40.2], ghost, laps: [] });
    expect(loadRecords('camaro')?.ghost?.length).toBe(ghost.length);
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });
});
