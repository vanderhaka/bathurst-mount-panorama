import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { SessionProfiles } from '@/game/session-profiles';
import { FuelModel } from '@/physics/fuel';
import type { VehicleInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const DT = 1 / 360;
const bathurst = new Track();

function lap(fuel: FuelModel, seconds: number, throttle: number): void {
  for (let i = 0; i < seconds * 10; i++) fuel.advance(throttle, 0.1);
  fuel.crossLine();
}

describe('refuelling at the line', () => {
  it('refills to the stint load only when the tank cannot finish the next lap, keeping the per-lap measurement', () => {
    const fuel = new FuelModel();
    fuel.reset(80);
    expect(fuel.refuelIfShort(80, 6213)).toBe(false);
    fuel.litres = 3; // no lap measured yet: a conservative estimate from the lap length
    expect(fuel.refuelIfShort(80, 6213)).toBe(true);
    expect(fuel.litres).toBe(80);
    lap(fuel, 125, 0.65); // ~4 L
    const perLap = fuel.perLapL!;
    expect(perLap).toBeGreaterThan(3.5);
    fuel.litres = perLap * 1.3;
    expect(fuel.refuelIfShort(80, 6213)).toBe(false);
    fuel.litres = perLap * 1.05;
    expect(fuel.refuelIfShort(80, 6213)).toBe(true);
    expect(fuel.litres).toBe(80);
    expect(fuel.perLapL).toBe(perLap);
    expect(fuel.lapsLeft).toBeCloseTo(80 / perLap, 6);
    lap(fuel, 125, 0.65);
    expect(fuel.perLapL).toBeCloseTo(perLap, 6); // the refill is not counted as burnt (or negative) fuel
  });

  it('never refills below one lap, even from a tiny stint load', () => {
    const fuel = new FuelModel();
    fuel.reset(2);
    expect(fuel.refuelIfShort(2, 3219)).toBe(true);
    expect(fuel.litres).toBeGreaterThan(3219 * 0.0012);
  });

  for (const [name, track, laps] of [['Bathurst', bathurst, 24], ['Adelaide', createAdelaideTrack(), 34]] as const) {
    it(`${name}: a long AI run never runs dry, refuels at the line and keeps lapping`, () => {
      const line = computeRacingLine(track), v = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, line));
      v.stint.reset({ tempC: 95 });
      const s0 = track.wrapS(track.startLineS - 300);
      v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
      const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai);
      const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      const refuels0 = v.stint.refuels;
      let minLitres = Infinity, maxAfterRefuel = 0, refuels = refuels0;
      for (let k = 0; k < 360 * 150 * laps && v.stint.completedLaps < laps; k++) {
        profiles.update();
        ap.drive(v, input);
        v.step(input, DT);
        minLitres = Math.min(minLitres, v.stint.fuel.litres);
        if (v.stint.refuels !== refuels) { refuels = v.stint.refuels; maxAfterRefuel = Math.max(maxAfterRefuel, v.stint.fuel.litres); }
      }
      console.log(JSON.stringify({ name, laps: v.stint.completedLaps, refuels: refuels - refuels0, minLitres, maxAfterRefuel, perLapL: v.stint.fuel.perLapL }));
      expect(v.stint.completedLaps).toBe(laps);
      expect(refuels - refuels0).toBeGreaterThanOrEqual(1);
      expect(minLitres).toBeGreaterThan(0.5);
      expect(maxAfterRefuel).toBeGreaterThan(79.99);
      expect(v.stint.fuel.lapsLeft!).toBeGreaterThan(1);
    }, 120000);
  }

  it('shows a short REFUELLED message, after a lap message that is already on screen', () => {
    const line = computeRacingLine(bathurst), v = new Vehicle(CAR_SPECS.camaro, bathurst, placeKerbs(bathurst, line));
    const entity = { vehicle: v, livery: { number: 6, primary: 0xff0000 }, reset: (s: number, d: number) => v.reset(s, d), repair: () => v.repair() } as unknown as CarEntity;
    const session = new RaceSession('camaro', bathurst, line, entity);
    session.placeOnGrid();
    session.lights = -1;
    const lineS = bathurst.startLineS, cross = () => {
      v.stint.reset();
      v.stint.fuel.litres = 2;
      v.stint.placeOnTrack(lineS - 1);
      v.stint.advance(v.telemetry, DT, lineS + 1, lineS, bathurst.length);
    };
    cross();
    session.update(1 / 60);
    expect(session.currentMessage()).toEqual({ text: 'REFUELLED', kind: 'info' });
    expect(v.stint.fuel.litres).toBeGreaterThan(79.99);
    for (let t = 0; t < 3; t += 1 / 60) session.updateLights(1 / 60);
    expect(session.currentMessage()).toBeNull();
    session.say('LAP 2:04.000', 'info', 3);
    cross();
    session.update(1 / 60);
    expect(session.currentMessage()?.text).toBe('LAP 2:04.000');
    for (let t = 0; t < 3.05; t += 1 / 60) session.updateLights(1 / 60);
    expect(session.currentMessage()?.text).toBe('REFUELLED');
  });
});
