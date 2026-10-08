import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs, type KerbLayout } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

// Regression for "the car lifts on two wheels when turning hard": on smooth, level road a
// Gen3 car keeps all four tyres loaded up to its grip limit; only kerbs, bumps and impacts unload one.
const DT = 1 / 360;
const CARS: CarKind[] = ['camaro', 'mustang', 'supra'];
const bathurst = new Track(), line = computeRacingLine(bathurst), kerbs = placeKerbs(bathurst, line);

/** Unbounded level asphalt: the Bathurst samples flattened, with the road edges and walls far away. */
const flat = new Track();
flat.py.fill(0); flat.grade.fill(0); flat.bank.fill(0);
for (const side of [flat.left, flat.right]) { side.edge.fill(5000); side.wall.fill(9000); }
const noKerbs: KerbLayout = { line, left: new Float32Array(flat.n), right: new Float32Array(flat.n), leftType: new Uint8Array(flat.n), rightType: new Uint8Array(flat.n) };

const idle = (): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false });

interface Run { minLoad: number; peakG: number; limitReached: boolean }

/** Settles a car on the flat road, then runs it straight at `speed` (m/s) in a matching gear. */
function launch(kind: CarKind, speed: number): Vehicle {
  const v = new Vehicle(CAR_SPECS[kind], flat, noKerbs);
  // Race-warm tyres: the grip limit (and so the load transfer) is highest, and a short test must
  // not depend on how fast sliding heats cold tyres.
  v.stint.reset({ tempC: 95 });
  v.reset(1000, 0);
  for (let k = 0; k < 360; k++) v.step(idle(), DT);
  v.vx = Math.sin(v.heading) * speed;
  v.vz = Math.cos(v.heading) * speed;
  v.pt.gear = speed > 60 ? 6 : speed > 45 ? 5 : speed > 35 ? 4 : speed > 25 ? 3 : 2;
  for (let k = 0; k < 180; k++) v.step({ ...idle(), throttle: 0.3 }, DT);
  return v;
}

function track(run: Run, v: Vehicle): void {
  for (const w of v.wheels) run.minLoad = Math.min(run.minLoad, w.load);
  run.peakG = Math.max(run.peakG, Math.abs(v.telemetry.gLat));
}

/**
 * Holds a left-hand circle of radius r while the lateral target rises 0.05 g per second,
 * until the car can no longer hold the radius (the grip limit).
 */
function steadyCircle(kind: CarKind, r: number): Run {
  let targetG = 0.8;
  const v = launch(kind, Math.sqrt(targetG * 9.81 * r));
  const cx = v.x + Math.cos(v.heading) * r, cz = v.z - Math.sin(v.heading) * r;
  const run: Run = { minLoad: Infinity, peakG: 0, limitReached: false }, input = idle();
  let integral = 0, speedI = 0, lostS = 0;
  for (let t = 0; t < 40 && !run.limitReached; t += DT) {
    const dx = cx - v.x, dz = cz - v.z, dist = Math.hypot(dx, dz), error = dist - r;
    let headErr = Math.atan2(-dz / dist, dx / dist) - v.heading;
    while (headErr > Math.PI) headErr -= 2 * Math.PI;
    while (headErr < -Math.PI) headErr += 2 * Math.PI;
    integral = Math.max(-0.2, Math.min(0.2, integral + error * 0.02 * DT));
    const delta = (v.spec.dimensions.wheelbase / r) * 1.3 + headErr + Math.atan((0.6 * error) / Math.max(5, v.speed)) + integral;
    input.steer = Math.max(-1, Math.min(1, delta / v.spec.maxSteerRad));
    targetG += 0.05 * DT;
    const speedErr = Math.sqrt(targetG * 9.81 * r) - v.speed;
    speedI = Math.max(-0.3, Math.min(0.5, speedI + speedErr * 0.05 * DT));
    input.throttle = Math.max(0, Math.min(1, speedErr * 0.5 + speedI + 0.3));
    input.shiftUp = v.pt.gear < 6 && v.pt.rpm > 7000;
    v.step(input, DT);
    if (t > 1) track(run, v);
    lostS = Math.abs(error) > 3 ? lostS + DT : 0;
    run.limitReached = lostS > 0.5;
  }
  return run;
}

/** Straight at kmh, then the steering snaps to `steer` (rate-limited by the car) and holds for 2.5 s. */
function turnIn(kind: CarKind, kmh: number, steer: number, keyboardAssist = false): Run {
  const v = launch(kind, kmh / 3.6);
  const run: Run = { minLoad: Infinity, peakG: 0, limitReached: false }, input = idle();
  for (let t = 0; t < 2.5; t += DT) {
    // The game's steering assist narrows the lock with speed (src/race/assists.ts, keyboard reference 40 m/s).
    input.steer = keyboardAssist ? steer / (1 + (v.speed / 40) ** 2) : steer;
    input.throttle = Math.max(0, Math.min(1, (kmh / 3.6 - v.speed) * 0.5 + 0.4));
    v.step(input, DT);
    track(run, v);
  }
  return run;
}

describe('no wheel lift in hard cornering on smooth road', () => {
  for (const kind of CARS) {
    it(`${kind}: keeps all four wheels loaded in steady circles up to the grip limit`, () => {
      // 15 m is a full-lock hairpin (Adelaide's Dequetteville is ~13 m); 100 m is a fast sweeper.
      const log: string[] = [];
      for (const r of [15, 40, 100]) {
        const run = steadyCircle(kind, r);
        log.push(`R${r}: ${run.peakG.toFixed(2)} g, min ${run.minLoad.toFixed(0)} N`);
        expect(run.limitReached, `${r} m circle reaches the limit`).toBe(true);
        expect(run.peakG, `${r} m circle peak lateral g`).toBeGreaterThan(1.75);
        expect(run.minLoad, `${r} m circle minimum wheel load (N)`).toBeGreaterThan(0);
      }
      console.log(`${kind} steady: ${log.join('; ')}`);
    }, 20000);

    it(`${kind}: keeps all four wheels loaded through a sharp turn-in at 150-250 km/h and a full-lock hairpin`, () => {
      const cases: Array<[number, number, boolean]> = [
        [60, 1, false], [150, 0.15, false], [150, 0.3, false], [200, 0.15, false], [200, 0.3, false],
        [250, 0.15, false], [250, 0.3, false], [150, 1, true], [200, 1, true], [250, 1, true],
      ];
      const log: string[] = [];
      for (const [kmh, steer, assist] of cases) {
        const run = turnIn(kind, kmh, steer, assist);
        log.push(`${kmh}/${steer}${assist ? 'a' : ''}: ${run.peakG.toFixed(2)} g, min ${run.minLoad.toFixed(0)} N`);
        expect(run.peakG, `${kmh} km/h steer ${steer} reaches the limit`).toBeGreaterThan(1.75);
        expect(run.minLoad, `${kmh} km/h steer ${steer}${assist ? ' (assist)' : ''} minimum wheel load (N)`).toBeGreaterThan(0);
      }
      console.log(`${kind} turn-in: ${log.join('; ')}`);
    }, 20000);
  }

  it('still lets a raised kerb strike unload a wheel (the wheels are not glued down)', () => {
    const raised: KerbLayout = { ...kerbs, leftType: Uint8Array.from(kerbs.leftType, () => 1) };
    for (const kind of CARS) {
      const v = new Vehicle(CAR_SPECS[kind], bathurst, raised);
      const i = Math.round(5588 / bathurst.spacing); // The Chase, turn 21
      v.reset(i * bathurst.spacing, bathurst.left.edge[i] - 1.3);
      v.heading += 0.15;
      for (let k = 0; k < 360; k++) v.step(idle(), DT);
      v.vx = Math.sin(v.heading) * 26;
      v.vz = Math.cos(v.heading) * 26;
      let onKerb = false, unloadedSteps = 0;
      for (let k = 0; k < 180; k++) {
        v.step(idle(), DT);
        onKerb ||= v.wheels.some((w) => w.surface === 'kerb');
        if (onKerb && v.wheels.some((w) => w.load <= 0)) unloadedSteps++;
      }
      console.log(`${kind} raised kerb at 26 m/s: ${unloadedSteps} steps with a wheel unloaded`);
      expect(onKerb).toBe(true);
      expect(unloadedSteps, `${kind} kerb strike`).toBeGreaterThan(0);
    }
  }, 20000);
});
