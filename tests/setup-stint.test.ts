import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { defaultSetup } from '@/config/setup';
import { SessionProfiles } from '@/game/session-profiles';
import { pressureGrip, setupSpec } from '@/physics/setup-forces';
import { stintSpec } from '@/physics/stint-spec';
import * as tyre from '@/physics/tyre';
import type { VehicleInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const neutral: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
const DT = 1 / 360;
function car(kind: CarKind = 'camaro'): Vehicle {
  const v = new Vehicle(CAR_SPECS[kind], track, kerbs);
  v.stint.reset({ fuelL: 132, compound: 'hard', tempC: 65, wear: .3 });
  v.reset(4350, 0);
  v.setup = { ...defaultSetup(kind), frontPressureKpa: 120, rearPressureKpa: 165 };
  return v;
}

describe('setup alongside the fuel and tyre stint', () => {
  for (const kind of ['camaro', 'mustang', 'supra'] as CarKind[]) {
    it(`${kind}: combines handling, pressure and stint once for both owned profiles`, () => {
      const v = car(kind), measured = { ...v.spec };
      v.handling = { ...DEFAULT_HANDLING, grip: 1.35, rearGrip: 1.18, downforce: 1.08 };
      const profiles = new SessionProfiles(v, line);
      const spec = stintSpec(setupSpec(tunedSpec(v.spec, v.handling), v.setup), v.stint);
      const expected = computeSpeedProfile(track, line, spec, LINE_PROFILE);
      const ai = computeSpeedProfile(track, line, spec, AI_PROFILE);
      expect(spec.massKg).toBe(v.massKg);
      expect(spec.massKg).toBe(measured.massKg + (132 - 80) * .75);
      expect(profiles.player.speed).toEqual(expected.speed);
      expect(profiles.player.cornerLimit).toEqual(expected.cornerLimit);
      expect(profiles.player.lapTimeS).toBe(expected.lapTimeS);
      expect(profiles.ai.speed).toEqual(ai.speed);
      expect(v.spec).toEqual(measured);
      expect(v.spec).toBe(CAR_SPECS[kind]);
    });

    it(`${kind}: axle pressure multiplies each existing tyre's grip in actual force calls`, () => {
      const v = car(kind), grip = v.stint.tyres.map((w) => w.grip);
      const spy = vi.spyOn(tyre, 'tyreForces');
      try {
        v.vx = Math.sin(v.heading) * 30;
        v.vz = Math.cos(v.heading) * 30;
        expect(v.step({ ...neutral, brake: .6, steer: .2 }, DT)).toHaveLength(0);
        expect(spy).toHaveBeenCalledTimes(4);
        spy.mock.calls.forEach((call, w) => {
          const front = w < 2, pressure = front ? v.setup.frontPressureKpa : v.setup.rearPressureKpa;
          const expected = v.spec.tyreMu * v.handling.grip * (front ? 1 : v.handling.rearGrip)
            * tyre.SURFACE[v.wheels[w].surface].grip * pressureGrip(pressure) * grip[w];
          expect(call[1]).toBeCloseTo(expected, 12);
        });
      } finally { spy.mockRestore(); }
      expect(v.telemetry.tyres).toBe(v.stint.tyres);
      expect(v.telemetry.fuel).toBe(v.stint.fuel);
    });
  }

  it('refreshes live pressure after one physics second and preserves setup through recovery and a new stint', () => {
    const v = car(), profiles = new SessionProfiles(v, line);
    const player = profiles.player, speed = player.speed, corners = player.cornerLimit, aiSpeed = profiles.ai.speed;
    const before = speed.slice();
    v.setup = { ...v.setup, frontPressureKpa: 180, rearPressureKpa: 120 };
    for (let i = 0; i < 100; i++) profiles.update();
    for (let i = 0; i < 359; i++) { v.step(neutral, DT); profiles.update(); }
    expect(speed).toEqual(before);
    v.step(neutral, DT); profiles.update();
    const expected = computeSpeedProfile(track, line, stintSpec(setupSpec(tunedSpec(v.spec, v.handling), v.setup), v.stint), LINE_PROFILE);
    expect(speed).toEqual(expected.speed);
    expect(profiles.player).toBe(player);
    expect(player.speed).toBe(speed); expect(player.cornerLimit).toBe(corners); expect(profiles.ai.speed).toBe(aiSpeed);
    const setup = v.setup, fuel = v.stint.fuel.litres, tyres = v.stint.tyres.map((w) => ({ ...w }));
    v.reset(1300, 0);
    expect(v.setup).toBe(setup); expect(v.stint.fuel.litres).toBe(fuel); expect(v.stint.tyres).toEqual(tyres);
    v.stint.reset({ compound: 'hard' }); v.reset(4350, 0); profiles.reset();
    expect(v.setup).toBe(setup); expect(v.stint.fuel.litres).toBe(80);
    expect(v.stint.tyreModel.compound).toBe('hard'); expect(v.stint.tyres[0].tempC).toBe(52);
    expect(v.stint.tyres[0].wear).toBe(0); expect(profiles.player.speed).toBe(speed);
  });
});
