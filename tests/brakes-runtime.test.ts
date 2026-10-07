import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { SessionProfiles } from '@/game/session-profiles';
import { stintSpec } from '@/physics/stint-spec';
import { Vehicle } from '@/physics/vehicle';
import { tyreGrip } from '@/physics/tyre-state';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line), DT = 1 / 360;
const pedal = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
function car(speed = 50): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.stint.reset({ tempC: 95 }); v.reset(1300, 0);
  v.vx = Math.sin(v.heading) * speed; v.vz = Math.cos(v.heading) * speed;
  return v;
}
function lock(v: Vehicle): void {
  v.assists.abs = false;
  for (let i = 0; i < 180; i++) v.step({ ...pedal, brake: 1 }, DT);
  expect(v.flatSpots.tyres.some((tyre) => tyre.severity > 0)).toBe(true);
}

describe('owned brake and flat-spot state through real vehicle forces', () => {
  it('owns independent stable readings and applies hot-disc fade to physical braking', () => {
    const cold = car(), hot = car(); hot.brakes.reset(1050);
    expect(cold.telemetry.brakes).toBe(cold.brakes.discs);
    expect(cold.telemetry.flatSpots).toBe(cold.flatSpots.tyres);
    expect(hot.brakes.discs).not.toBe(cold.brakes.discs);
    const reading = hot.brakes.discs[0];
    for (let i = 0; i < 90; i++) {
      cold.step({ ...pedal, brake: 0.2 }, DT); hot.step({ ...pedal, brake: 0.2 }, DT);
    }
    expect(hot.speed).toBeGreaterThan(cold.speed + 0.2);
    expect(hot.brakes.discs[0]).toBe(reading);
    expect(cold.brakes.discs[0].energyJ).toBeGreaterThan(hot.brakes.discs[0].energyJ);
    expect(cold.flatSpots.tyres.every((tyre) => tyre.severity === 0)).toBe(true);
  });

  it('qualifies real ABS-off locks, leaves ABS-on tyres intact and uses the loss with current tyre grip', () => {
    const locked = car(), abs = car(); lock(locked);
    for (let i = 0; i < 180; i++) abs.step({ ...pedal, brake: 1 }, DT);
    expect(abs.flatSpots.tyres.every((tyre) => tyre.severity === 0)).toBe(true);
    const profile = stintSpec(locked.spec, locked.stint);
    const effective = locked.stint.tyres.reduce((sum, tyre, w) => sum + tyre.grip * locked.flatSpots.tyres[w].gripMultiplier, 0) / 4;
    expect(profile.tyreMu).toBeCloseTo(locked.spec.tyreMu * effective, 10);
    const damage = locked.flatSpots.tyres.map((tyre) => tyre.severity);
    locked.assists.abs = true;
    for (let i = 0; i < 90; i++) locked.step(pedal, DT);
    expect(locked.flatSpots.tyres.map((tyre) => tyre.severity)).toEqual(damage);
    for (const tyre of locked.stint.tyres) expect(tyre.grip).toBe(tyreGrip('soft', tyre.tempC, tyre.wear));
  });

  it('reduces physical tyre-limited braking while leaving the shared tyre-model grip unmodified', () => {
    const fresh = car(), damaged = car();
    for (let w = 0; w < 4; w++) damaged.flatSpots.advance(w, 2, 50, 4000, 'road', 1);
    fresh.step({ ...pedal, brake: 1 }, DT); damaged.step({ ...pedal, brake: 1 }, DT);
    expect(damaged.telemetry.gLong).toBeGreaterThan(fresh.telemetry.gLong + 0.01);
    expect(damaged.speed).toBeGreaterThan(fresh.speed);
    for (const tyre of damaged.stint.tyres) expect(tyre.grip).toBe(tyreGrip('soft', tyre.tempC, tyre.wear));
  });

  it('preserves damage, heat, compound and fuel on recovery/repair; Restart fits the selected fresh set', () => {
    const v = car(); lock(v); v.brakes.reset(820);
    v.stint.fuel.reset(35);
    const entity = { vehicle: v, reset: (s: number, d: number) => v.reset(s, d), repair: () => v.repair() } as unknown as CarEntity;
    const race = new RaceSession('camaro', track, line, entity, 'hard');
    const before = JSON.stringify({ brakes: v.brakes.discs, spots: v.flatSpots.tyres, tyres: v.stint.tyres });
    race.resetToTrack();
    expect(JSON.stringify({ brakes: v.brakes.discs, spots: v.flatSpots.tyres, tyres: v.stint.tyres })).toBe(before);
    expect(v.stint.fuel.litres).toBe(35);
    race.placeOnGrid();
    expect(v.brakes.discs.every((disc) => disc.tempC === 22 && disc.energyJ === 0)).toBe(true);
    expect(v.flatSpots.tyres.every((tyre) => tyre.severity === 0)).toBe(true);
    expect(v.stint.tyreModel.compound).toBe('hard'); expect(v.stint.tyres[0].tempC).toBe(52);
    expect(v.stint.fuel.litres).toBe(80);
  });

  it('fits tyres through one common path without refilling fuel or cooling hot brakes', () => {
    const v = car(); lock(v); v.brakes.reset(820); v.stint.fuel.reset(35);
    const tyre = v.stint.tyres[0], spot = v.flatSpots.tyres[0], disc = v.brakes.discs[0];
    v.stint.fitTyres('hard', 70, 0.1);
    expect(v.stint.tyres[0]).toBe(tyre); expect(tyre.tempC).toBe(70); expect(tyre.wear).toBe(0.1);
    expect(v.flatSpots.tyres[0]).toBe(spot); expect(spot.severity).toBe(0);
    expect(v.brakes.discs[0]).toBe(disc); expect(disc.tempC).toBe(820);
    expect(v.stint.fuel.litres).toBe(35);
  });

  it('keeps the simulation-time profile refresh and updates its owned arrays with damaged-tyre grip', () => {
    const v = car(), profiles = new SessionProfiles(v, line), speed = profiles.ai.speed;
    const before = speed.slice(); lock(v);
    profiles.update(); expect(speed).toEqual(before);
    v.simulationS = 1; profiles.update();
    expect(profiles.ai.speed).toBe(speed);
    expect(speed.some((value, i) => value < before[i] - 0.05)).toBe(true);
    expect(v.spec.tyreMu).toBe(CAR_SPECS.camaro.tyreMu);
  });

  it('uses the actual reverse brake pedal, without adding caliper work for the automatic reverse drive pedal', () => {
    const autoDrive = car(-30), autoBrake = car(-30), manualBrake = car(-30);
    for (const v of [autoDrive, autoBrake, manualBrake]) { v.pt.gear = -1; v.pt.rpm = 4000; }
    manualBrake.assists.autoGears = false;
    autoDrive.step({ ...pedal, brake: 0.25 }, DT);
    autoBrake.step({ ...pedal, throttle: 0.25 }, DT);
    manualBrake.step({ ...pedal, brake: 0.25 }, DT);
    expect(autoDrive.brakes.discs.every((disc) => disc.energyJ === 0)).toBe(true);
    expect(autoBrake.brakes.discs.every((disc) => disc.energyJ > 0)).toBe(true);
    expect(manualBrake.brakes.discs.every((disc) => disc.energyJ > 0)).toBe(true);
  });
});
