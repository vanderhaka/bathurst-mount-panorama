import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { AI_PROFILE } from '@/race/autopilot';
import { AiDriver } from '@/race/field/ai-driver';
import { resolveCarContacts, type CarHit } from '@/race/field/car-contact';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { projectToTrack, createTrackPoint } from '@/track/track-query';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);
const spec = CAR_SPECS.camaro;
const tuned = tunedSpec(spec, DEFAULT_HANDLING);
const DT = 1 / 360;
const H = 1 / 60;
const SUB = 6;

function input(): VehicleInput {
  return { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
}

/** Penetration depth of two cars' rectangles (0 when apart), by SAT. */
function depth(a: Vehicle, b: Vehicle): number {
  const quad = (v: Vehicle): number[] => {
    const { length, width } = v.spec.dimensions, s = Math.sin(v.heading), c = Math.cos(v.heading), out: number[] = [];
    for (const [f, l] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) out.push(v.x + (f * length * s) / 2 + (l * width * c) / 2, v.z + (f * length * c) / 2 - (l * width * s) / 2);
    return out;
  };
  const qa = quad(a), qb = quad(b);
  let min = Infinity;
  for (const v of [a, b]) {
    for (const [ax, az] of [[Math.sin(v.heading), Math.cos(v.heading)], [Math.cos(v.heading), -Math.sin(v.heading)]]) {
      const pr = (q: number[]): number[] => [0, 2, 4, 6].map((k) => q[k] * ax + q[k + 1] * az);
      const pa = pr(qa), pb = pr(qb);
      min = Math.min(min, Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)));
    }
  }
  return Math.max(0, min);
}

function energy(cars: Vehicle[]): number {
  return cars.reduce((e, v) => e + 0.5 * v.massKg * (v.vx ** 2 + v.vz ** 2) + 0.5 * v.spec.yawInertia * (v.massKg / v.spec.massKg) * v.yawRate ** 2, 0);
}

function pair(s: number, dB: number, gap: number): [Vehicle, Vehicle] {
  const a = new Vehicle(spec, track, kerbs), b = new Vehicle(spec, track, kerbs);
  a.reset(s, 0);
  b.reset(s + spec.dimensions.length - gap, dB); // gap = overlap along the track
  return [a, b];
}

function setSpeed(v: Vehicle, mps: number): void {
  v.vx = Math.sin(v.heading) * mps;
  v.vz = Math.cos(v.heading) * mps;
}

describe('car contact', () => {
  const hits: CarHit[] = [];

  it('separates overlapping cars and stops them closing, without adding energy', () => {
    const [a, b] = pair(1200, 0.2, 0.5);
    setSpeed(a, 12);
    setSpeed(b, 4);
    const e0 = energy([a, b]);
    expect(depth(a, b)).toBeGreaterThan(0.3);
    const out = resolveCarContacts([a, b], hits);
    expect(out).toHaveLength(1);
    expect(out[0].speed).toBeGreaterThan(7);
    expect(out[0].a).toBe(0);
    expect(depth(a, b)).toBeLessThan(0.01);
    expect(b.speed).toBeGreaterThanOrEqual(a.speed - 1e-6);
    expect(energy([a, b])).toBeLessThanOrEqual(e0);
    expect(energy([a, b])).toBeGreaterThan(0.2 * e0);
  });

  it('does not launch a car on a glancing side touch', () => {
    const [a, b] = pair(1200, 0, 0);
    const w = spec.dimensions.width;
    b.reset(1200, -(w - 0.04)); // side by side, 4 cm of overlap
    setSpeed(a, 40);
    setSpeed(b, 40);
    b.vx += Math.cos(b.heading) * 1.0; // closing at 1 m/s
    b.vz -= Math.sin(b.heading) * 1.0;
    const e0 = energy([a, b]);
    resolveCarContacts([a, b], hits);
    expect(Math.abs(a.yawRate)).toBeLessThan(0.1);
    expect(Math.abs(b.yawRate)).toBeLessThan(0.1);
    expect(Math.hypot(a.vx - 40 * Math.sin(a.heading), a.vz - 40 * Math.cos(a.heading))).toBeLessThan(1.5);
    expect(energy([a, b])).toBeLessThanOrEqual(e0);
  });

  it('leaves distant cars alone and keeps tp in step with the moved position', () => {
    const [a, b] = pair(1200, 0, -30);
    setSpeed(a, 30);
    const before = [a.x, a.z, a.vx, a.vz, b.x, b.z];
    expect(resolveCarContacts([a, b], hits)).toHaveLength(0);
    expect([a.x, a.z, a.vx, a.vz, b.x, b.z]).toEqual(before);

    const [c, d] = pair(1200, 0, 1);
    const s0 = d.tp.s;
    resolveCarContacts([c, d], hits);
    const ref = createTrackPoint();
    projectToTrack(track, d.x, d.z, -1, ref);
    expect(d.tp.s).toBeCloseTo(ref.s, 3);
    expect(d.tp.d).toBeCloseTo(ref.d, 3);
    expect(d.tp.s).toBeGreaterThan(s0);
  });
});

interface Racer { v: Vehicle; ai: AiDriver; progress: number; s0: number; lastS: number; slowT: number; done: number }

function raceLap(paces: number[], grip: number | undefined) {
  const profile = computeSpeedProfile(track, line, tuned, grip ? { ...AI_PROFILE, gripFactor: grip } : AI_PROFILE);
  const racers: Racer[] = paces.map((pace, k) => {
    const v = new Vehicle(spec, track, kerbs);
    const s0 = track.gridLineS - 8 * (k + 1);
    v.reset(s0, k % 2 === 0 ? -2 : 2);
    return { v, ai: new AiDriver(track, line, profile, pace, 100 + k), progress: 0, s0, lastS: v.tp.s, slowT: 0, done: 0 };
  });
  const cars = racers.map((r) => r.v);
  const hits: CarHit[] = [];
  const inp = input();
  let t = 0, maxOverlap = 0, maxWall = 0, steps = 0, changes = 0, ms = 0;
  let order = racers.map((_, k) => k).sort((x, y) => racers[y].s0 - racers[x].s0).join();
  const minSpeedHold: number[] = racers.map(() => 0);
  while (t < 300 && racers.some((r) => !r.done)) {
    const t0 = performance.now();
    for (const r of racers) {
      const others = cars.filter((c) => c !== r.v);
      for (let k = 0; k < SUB; k++) {
        r.ai.drive(r.v, others, inp);
        for (const im of r.v.step(inp, DT)) maxWall = Math.max(maxWall, im.speed);
        steps++;
      }
    }
    resolveCarContacts(cars, hits);
    ms += performance.now() - t0;
    t += H;
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) maxOverlap = Math.max(maxOverlap, depth(cars[i], cars[j]));
    racers.forEach((r, k) => {
      let d = r.v.tp.s - r.lastS;
      if (d > track.length / 2) d -= track.length;
      else if (d < -track.length / 2) d += track.length;
      r.progress += d;
      r.lastS = r.v.tp.s;
      if (!r.done && r.progress >= track.length) r.done = t;
      if (t > 10 && !r.done) {
        r.slowT = r.v.speed < 2 ? r.slowT + H : 0;
        minSpeedHold[k] = Math.max(minSpeedHold[k], r.slowT);
      }
    });
    const now = racers.map((_, k) => k).sort((x, y) => racers[y].s0 + racers[y].progress - racers[x].s0 - racers[x].progress).join();
    if (now !== order) { changes++; order = now; }
  }
  return { racers, maxOverlap, maxWall, changes, maxSlow: Math.max(...minSpeedHold), msPerStep: ms / steps, t };
}

describe('AI field', () => {
  it('runs a 5-car grid lap with passing and no resets', () => {
    const t0 = performance.now();
    const r = raceLap([0.88, 0.92, 0.96, 1.0, 1.03], undefined);
    const wall = (performance.now() - t0) / 1000;
    console.log(`field: ${wall.toFixed(1)} s wall, ${(r.msPerStep * 1000).toFixed(1)} us per Vehicle.step (incl. AI), laps ${r.racers.map((x) => x.done.toFixed(1)).join(' ')}, changes ${r.changes}, max overlap ${r.maxOverlap.toFixed(3)}, max wall ${r.maxWall.toFixed(1)}, max slow ${r.maxSlow.toFixed(1)} s, states ${r.racers.map((x) => x.ai.state).join(',')}`);
    for (const x of r.racers) { expect(x.done).toBeGreaterThan(100); expect(x.done).toBeLessThan(220); }
    expect(r.maxSlow).toBeLessThan(3);
    expect(r.maxOverlap).toBeLessThan(0.15);
    expect(r.maxWall).toBeLessThan(15);
    expect(r.changes).toBeGreaterThanOrEqual(1);
  }, 120000);

  it('goes around a parked car on the Conrod straight without touching it', () => {
    const profile = computeSpeedProfile(track, line, tuned, AI_PROFILE);
    const parkedS = 4700, i = Math.floor(parkedS / track.spacing);
    const parked = new Vehicle(spec, track, kerbs), v = new Vehicle(spec, track, kerbs);
    parked.reset(parkedS, line.offset[i]);
    v.reset(4150, line.offset[Math.floor(4150 / track.spacing)]);
    const ai = new AiDriver(track, line, profile, 1, 7), hold = input(), inp = input(), hits: CarHit[] = [];
    hold.brake = 1;
    let maxHit = 0, maxWall = 0, t = 0;
    while (t < 30 && v.tp.s < parkedS + 30) {
      for (let k = 0; k < SUB; k++) {
        ai.drive(v, [parked], inp);
        for (const im of v.step(inp, DT)) maxWall = Math.max(maxWall, im.speed);
        parked.step(hold, DT);
      }
      for (const h of resolveCarContacts([v, parked], hits)) maxHit = Math.max(maxHit, h.speed);
      t += H;
    }
    expect(v.tp.s).toBeGreaterThan(parkedS + 30);
    expect(maxHit).toBeLessThan(1);
    expect(maxWall).toBeLessThan(5);
  });

  it('runs a hard-profile (gripFactor 0.93) lap without wall crashes', () => {
    const r = raceLap([1.0, 1.0, 1.0], 0.93);
    console.log(`hard: laps ${r.racers.map((x) => x.done.toFixed(1)).join(' ')}, max wall ${r.maxWall.toFixed(1)}, overlap ${r.maxOverlap.toFixed(3)}`);
    for (const x of r.racers) expect(x.done).toBeGreaterThan(100);
    expect(r.maxWall).toBeLessThan(15);
    expect(r.maxSlow).toBeLessThan(3);
    expect(r.maxOverlap).toBeLessThan(0.15);
  }, 120000);
});
