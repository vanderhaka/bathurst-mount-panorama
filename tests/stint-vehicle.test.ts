import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { FuelModel } from '@/physics/fuel';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { stintSpec } from '@/physics/stint-spec';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const input: VehicleInput = { throttle: 1, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
const DT = 1 / 360;

function car(fuelL = 80): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.stint.reset({ fuelL, tempC: 95 });
  v.reset(track.startLineS + 30, 0);
  return v;
}

describe('stint integration in Vehicle', () => {
  it('uses tank mass in the dynamics and shows the actual fixed-step state in telemetry', () => {
    const full = car(132), light = car(15);
    for (let i = 0; i < 360 * 4; i++) {
      full.step(input, DT);
      light.step(input, DT);
    }
    expect(light.speed).toBeGreaterThan(full.speed);
    expect(full.massKg - light.massKg).toBeCloseTo(87.75, 4);
    expect(full.telemetry.fuel).toBe(full.stint.fuel);
    expect(full.telemetry.tyres).toBe(full.stint.tyres);
    expect(full.telemetry.fuel.litres).toBeLessThan(132);
    expect(full.telemetry.tyres[2].wear).toBeGreaterThan(0);
  });

  it('applies tyre grip to the actual braking forces at identical mass and speed', () => {
    const cold = car(), warm = car();
    cold.stint.tyreModel.fit('soft', 52);
    for (const v of [cold, warm]) {
      v.reset(1300, 0);
      v.vx = Math.sin(v.heading) * 50;
      v.vz = Math.cos(v.heading) * 50;
    }
    const braking = { ...input, throttle: 0, brake: 1 };
    for (let i = 0; i < 180; i++) { cold.step(braking, DT); warm.step(braking, DT); }
    expect(cold.massKg).toBe(warm.massKg);
    expect(warm.speed).toBeLessThan(cold.speed - 0.1);
  });

  it('preserves stint state on a track reset, while an explicit session reset refills and replaces tyres', () => {
    const v = car();
    v.stint.reset({ fuelL: 40, compound: 'hard', tempC: 110, wear: 0.3 });
    v.reset(1000, 0);
    expect(v.stint.fuel.litres).toBe(40);
    expect(v.stint.tyres[0].wear).toBe(0.3);
    expect(v.stint.tyreModel.compound).toBe('hard');
    v.stint.reset();
    expect(v.stint.fuel).toBeInstanceOf(FuelModel);
    expect(v.stint.fuel.litres).toBe(80);
    expect(v.stint.tyres[0].wear).toBe(0);
    expect(v.stint.tyres[0].tempC).toBe(52);
  });

  it('feeds actual mass and grip into the existing speed-profile inputs without changing the car spec', () => {
    const v = car(132);
    v.stint.tyreModel.fit('soft', 95, 0.2);
    const original = v.spec.tyreMu;
    const current = stintSpec(v.spec, v.stint);
    expect(current.massKg).toBe(v.massKg);
    expect(current.tyreMu).toBeCloseTo(original * v.stint.tyres[0].grip, 8);
    expect(current.tyreMu).toBeLessThan(original);
    expect(v.spec.massKg).toBe(1400);
    expect(v.spec.tyreMu).toBe(original);
  });
});
