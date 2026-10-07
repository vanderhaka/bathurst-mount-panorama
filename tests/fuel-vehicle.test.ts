import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { buildHudState } from '@/game/hud-bridge';
import { RaceSession } from '@/game/race-session';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS } from '@/types/session';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const drive: VehicleInput = { throttle: 1, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
const DT = 1 / 360;

function car(fuelL = 80): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.stint.reset({ fuelL });
  v.reset(track.startLineS + 30, 0);
  return v;
}
function race(v: Vehicle): RaceSession {
  const entity = { vehicle: v, livery: { number: 6, primary: 0xff0000 },
    reset: (s: number, d: number) => v.reset(s, d), repair: () => v.repair(),
  } as unknown as CarEntity;
  return new RaceSession('camaro', track, line, entity);
}

describe('simulation fuel in Vehicle and HUD', () => {
  it('adds 0.75 kg per litre once, and a lighter car accelerates faster', () => {
    const full = car(132), light = car(15);
    for (let i = 0; i < 360 * 4; i++) { full.step(drive, DT); light.step(drive, DT); }
    expect(light.speed).toBeGreaterThan(full.speed);
    expect(full.massKg - light.massKg).toBeCloseTo(87.75, 4);
    expect(full.spec.massKg).toBe(1400);
    expect(full.telemetry.fuel).toBe(full.stint.fuel);
    expect(full.telemetry.fuel.litres).toBeLessThan(132);
  });

  it('removes engine drive with an empty tank', () => {
    const empty = car(0), fuelled = car();
    for (let i = 0; i < 360 * 2; i++) { empty.step(drive, DT); fuelled.step(drive, DT); }
    expect(Math.abs(empty.speed)).toBeLessThan(1);
    expect(fuelled.speed).toBeGreaterThan(10);
    expect(empty.stint.fuel.litres).toBe(0);
    expect(empty.telemetry.load).toBe(0);
  });

  it('burns fuel from the engine pedal in manual and automatic reverse', () => {
    const manualDrive = car(), manualBrake = car(), automaticDrive = car();
    for (const v of [manualDrive, manualBrake, automaticDrive]) v.pt.gear = -1;
    manualDrive.assists.autoGears = manualBrake.assists.autoGears = false;
    for (let i = 0; i < 360; i++) {
      manualDrive.step(drive, DT);
      manualBrake.step({ ...drive, throttle: 0, brake: 1 }, DT);
      automaticDrive.step({ ...drive, throttle: 0, brake: 1 }, DT);
    }
    expect(80 - manualDrive.stint.fuel.litres).toBeCloseTo(0.0482, 5);
    expect(80 - manualBrake.stint.fuel.litres).toBeCloseTo(0.0022, 5);
    expect(80 - automaticDrive.stint.fuel.litres).toBeCloseTo(0.0482, 5);
  });

  it('preserves fuel on recovery, refills on Restart and reads fuel without advancing physics', () => {
    const v = car(20), session = race(v);
    const profile = computeSpeedProfile(track, line, v.spec);
    const state = buildHudState(session, profile, DEFAULT_SETTINGS, 60, null);
    expect(state.fuel).toBe(v.telemetry.fuel);
    for (let i = 0; i < 10; i++) buildHudState(session, profile, DEFAULT_SETTINGS, 60, state);
    expect(v.stint.fuel.litres).toBe(20);
    session.resetToTrack();
    expect(v.stint.fuel.litres).toBe(20);
    session.placeOnGrid();
    expect(v.stint.fuel.litres).toBe(80);
    expect(v.stint.fuel.lapsLeft).toBeNull();
  });

  it('counts only forward line crossings and abandons teleported consumption samples', () => {
    const v = car();
    v.stint.placeOnTrack(track.startLineS - 1);
    v.stint.advance(v.telemetry, 0.1, track.startLineS + 1, track.startLineS);
    expect(v.stint.completedLaps).toBe(1);
    v.stint.advance(v.telemetry, 0.1, track.startLineS - 1, track.startLineS);
    expect(v.stint.completedLaps).toBe(1);
    v.stint.placeOnTrack(track.startLineS - 1000);
    v.stint.advance(v.telemetry, 0.1, track.startLineS + 1, track.startLineS);
    expect(v.stint.completedLaps).toBe(1);
  });
});
