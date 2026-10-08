import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { defaultSetup, type CarSetup } from '@/config/setup';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track();
const kerbs = placeKerbs(track, computeRacingLine(track));
const DT = 1 / 360;
const neutral: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };

function carAtSpeed(car: CarKind, setup: Partial<CarSetup>, speed = 100 / 3.6, s = 4350): Vehicle {
  const v = new Vehicle(CAR_SPECS[car], track, kerbs);
  v.setup = { ...defaultSetup(car), ...setup };
  v.assists.autoGears = false;
  v.reset(s, 0); // default: long straight section of Conrod
  // Move along the road, grade included: a purely horizontal start on a downhill launches the car.
  const i = Math.round(track.wrapS(s) / track.spacing) % track.n;
  const along = speed * Math.hypot(track.tx[i], track.tz[i]);
  v.vx = Math.sin(v.heading) * along;
  v.vz = Math.cos(v.heading) * along;
  v.vy = track.ty[i] * speed;
  v.pt.gear = speed > 40 ? 5 : 3;
  return v;
}

function stoppingDistance(car: CarKind, setup: Partial<CarSetup>): number {
  // Murray's braking zone (downhill) from 200 km/h. On level road four-channel ABS holds all four
  // tyres at their limit with either bias, so bias only shows where one axle is under its limit.
  const v = carAtSpeed(car, setup, 200 / 3.6, 6000);
  // Keep this intrinsic setup comparison on the pre-rubber surface; track-stint tests the native groove.
  const rubber = vi.spyOn(v.trackGrip, 'at').mockReturnValue(1);
  try {
    const x = v.x, z = v.z;
    for (let t = 0; t < 8 && v.speed > 0.3; t += DT) {
      expect(v.step({ ...neutral, brake: 1 }, DT)).toHaveLength(0);
    }
    expect(Math.abs(v.speed)).toBeLessThan(0.4);
    expect(v.wheels.every((w) => w.surface === 'road')).toBe(true);
    return Math.hypot(v.x - x, v.z - z);
  } finally { rubber.mockRestore(); }
}

function frontLoadTransferShare(car: CarKind, setup: Partial<CarSetup>): number {
  const v = carAtSpeed(car, setup, 0);
  const y = v.y, pitch = v.pitch;
  v.roll += 0.01;
  const roll = v.roll;
  // Seed compression at the imposed roll before measuring bar load transfer;
  // otherwise the transient damper blow-off masks most of the bar's contribution.
  v.step(neutral, DT);
  v.y = y; v.pitch = pitch; v.roll = roll;
  v.vy = v.pitchRate = v.rollRate = 0;
  v.step(neutral, DT);
  const front = Math.abs(v.wheels[0].load - v.wheels[1].load);
  const rear = Math.abs(v.wheels[2].load - v.wheels[3].load);
  return front / (front + rear);
}

function turnYaw(car: CarKind, setup: Partial<CarSetup>): number {
  const v = carAtSpeed(car, setup, 30);
  // The same corner-entry slip and yaw isolate which axle loses lateral grip.
  v.vx += Math.cos(v.heading) * 6;
  v.vz -= Math.sin(v.heading) * 6;
  v.yawRate = 0.5;
  v.steerAngle = 0.08;
  expect(v.step({ ...neutral, steer: 0.08 / v.spec.maxSteerRad }, DT)).toHaveLength(0);
  return v.yawRate;
}

describe('setup changes actual vehicle forces', () => {
  for (const car of ['camaro', 'mustang', 'supra'] as CarKind[]) {
    it(`${car}: front brake bias changes the stopping distance with ABS`, () => {
      const standard = stoppingDistance(car, {});
      expect(Math.abs(stoppingDistance(car, { brakeBiasFront: 0.68 }) - standard)).toBeGreaterThan(0.2);
    });

    it(`${car}: each anti-roll bar changes the front/rear load-transfer balance`, () => {
      const standard = frontLoadTransferShare(car, {});
      expect(frontLoadTransferShare(car, { frontArbNpm: 64000 })).toBeGreaterThan(standard + 0.003);
      expect(frontLoadTransferShare(car, { rearArbNpm: 36000 })).toBeLessThan(standard - 0.003);
    });

    it(`${car}: each axle's pressure changes stopping distance and corner response`, () => {
      const standard = stoppingDistance(car, {});
      const yaw = turnYaw(car, {});
      for (const pressure of [{ frontPressureKpa: 120 }, { rearPressureKpa: 120 }]) {
        expect(stoppingDistance(car, pressure)).toBeGreaterThan(standard + 0.2);
        expect(Math.abs(turnYaw(car, pressure) - yaw)).toBeGreaterThan(0.001);
      }
      expect(turnYaw(car, { frontPressureKpa: 120 })).toBeGreaterThan(yaw);
      expect(turnYaw(car, { rearPressureKpa: 120 })).toBeLessThan(yaw);
    });
  }
});
