import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarSpec } from '@/car/car-specs';
import { DEFAULT_HANDLING } from '@/config/handling';
import { defaultSetup } from '@/config/setup';
import { SessionProfiles } from '@/game/session-profiles';
import { pressureGrip } from '@/physics/setup-forces';
import { tyreGrip } from '@/physics/tyre-state';
import { Vehicle } from '@/physics/vehicle';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line), DT = 1 / 360;
const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
function car(spec: CarSpec = CAR_SPECS.camaro): Vehicle {
  const v = new Vehicle(spec, track, kerbs);
  v.stint.reset({ fuelL: 35, tempC: 95, wear: .1 }); v.reset(1300, 0);
  v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  return v;
}
function equivalent(): [Vehicle, Vehicle] {
  const actual = car();
  actual.setup = { ...defaultSetup('camaro'), frontPressureKpa: 120, rearPressureKpa: 180 };
  for (let w = 0; w < 4; w++) actual.flatSpots.advance(w, 2, 50, 4000, 'road', .8);
  // Both axle pressures have equal loss. Move only these two losses into a reference's raw mu.
  const reference = car({ ...CAR_SPECS.camaro,
    tyreMu: CAR_SPECS.camaro.tyreMu * pressureGrip(120) * actual.flatSpots.tyres[0].gripMultiplier });
  return [actual, reference];
}

describe('brakes composed with the saved setup and stint', () => {
  it('matches an equivalent raw-grip vehicle under actual tyre-limited hot-disc braking', () => {
    const [actual, reference] = equivalent();
    for (const v of [actual, reference]) v.brakes.reset(820);
    expect(actual.step({ ...input, brake: 1 }, DT)).toHaveLength(0);
    expect(reference.step({ ...input, brake: 1 }, DT)).toHaveLength(0);
    expect(actual.telemetry.gLong).toBeCloseTo(reference.telemetry.gLong, 12);
    expect(actual.telemetry.gLat).toBeCloseTo(reference.telemetry.gLat, 12);
    expect(actual.speed).toBeCloseTo(reference.speed, 12);
    actual.wheels.forEach((wheel, w) => {
      expect(wheel.load).toBeCloseTo(reference.wheels[w].load, 12);
      expect(wheel.slip).toBeCloseTo(reference.wheels[w].slip, 12);
      expect(actual.brakes.discs[w].energyJ).toBeCloseTo(reference.brakes.discs[w].energyJ, 10);
    });
    for (const tyre of actual.stint.tyres) expect(tyre.grip).toBe(tyreGrip('soft', tyre.tempC, tyre.wear));
    expect(actual.spec).toBe(CAR_SPECS.camaro);
  });

  it('delivers live front/rear bias times the current fade once using the measured torque reference', () => {
    const v = car(), pedal = .05;
    v.setup = { ...v.setup, brakeBiasFront: .64 }; v.brakes.reset(820);
    const fade = v.brakes.discs[0].forceMultiplier;
    expect(v.step({ ...input, brake: pedal }, DT)).toHaveLength(0);
    expect(v.telemetry.absActive).toBe(false);
    v.brakes.discs.forEach((disc, w) => {
      const bias = w < 2 ? .64 : .36;
      const expectedJ = pedal * v.spec.maxBrakeTorqueNm * (bias / .6) / v.spec.dimensions.wheelRadius * fade * 50 * DT;
      expect(disc.energyJ).toBeCloseTo(expectedJ, 10);
    });
    expect(v.brakes.discs[0].energyJ / v.brakes.discs[2].energyJ).toBeCloseTo(.64 / .36, 12);
    expect(v.spec.brakeBiasFront).toBe(.6);
  });

  it('matches both owned speed profiles with pressure, flat-spot and fuel effects applied once', () => {
    const [actual, reference] = equivalent();
    for (const v of [actual, reference]) v.handling = { ...DEFAULT_HANDLING, grip: 1.2, rearGrip: 1.1 };
    const profiles = new SessionProfiles(actual, line), comparison = new SessionProfiles(reference, line);
    expect(actual.massKg).toBe(CAR_SPECS.camaro.massKg + (35 - 80) * .75);
    for (const name of ['player', 'ai'] as const) {
      expect(profiles[name].speed).toEqual(comparison[name].speed);
      expect(profiles[name].cornerLimit).toEqual(comparison[name].cornerLimit);
      expect(profiles[name].lapTimeS).toBeCloseTo(comparison[name].lapTimeS, 12);
    }
    expect(actual.spec).toBe(CAR_SPECS.camaro);
  });
});
