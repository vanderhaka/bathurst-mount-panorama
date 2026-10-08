import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { defaultSetup } from '@/config/setup';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { BRAKE_AMBIENT_C } from '@/physics/brake-heat';
import { pressureGrip } from '@/physics/setup-forces';
import * as tyre from '@/physics/tyre';
import { Vehicle } from '@/physics/vehicle';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { rubberAmount } from '@/track/rubber-line';
import { Track } from '@/track/track-model';
import { sampleArray } from '@/track/track-query';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line), DT = 1 / 360;
const neutral = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };

/** Full-brake stop from 200 km/h in Murray's braking zone, planted along the road (the setup-physics case). */
function nativeStop(kind: CarKind, brakeBiasFront: number, mockRubber = false): number {
  const v = new Vehicle(CAR_SPECS[kind], track, kerbs);
  v.setup = { ...defaultSetup(kind), brakeBiasFront }; v.assists.autoGears = false;
  const s = 6000, i = Math.round(s / track.spacing) % track.n, speed = 200 / 3.6;
  v.reset(s, 0);
  const along = speed * Math.hypot(track.tx[i], track.tz[i]);
  v.vx = Math.sin(v.heading) * along; v.vz = Math.cos(v.heading) * along; v.vy = track.ty[i] * speed; v.pt.gear = 5;
  const rubber = mockRubber ? vi.spyOn(v.trackGrip, 'at').mockReturnValue(1) : null;
  try {
    const x = v.x, z = v.z;
    for (let t = 0; t < 8 && v.speed > .3; t += DT) expect(v.step({ ...neutral, brake: 1 }, DT)).toHaveLength(0);
    expect(Math.abs(v.speed)).toBeLessThan(.4); expect(v.wheels.every((w) => w.surface === 'road')).toBe(true);
    return Math.hypot(v.x - x, v.z - z);
  } finally { rubber?.mockRestore(); }
}

describe('track grip with the setup and brake stint', () => {
  for (const kind of ['camaro', 'mustang', 'supra'] as CarKind[]) {
    it(`${kind}: native rubber retains the shorter stop from increased front bias`, () => {
      const gain = nativeStop(kind, .6) - nativeStop(kind, .68);
      const mockedGain = nativeStop(kind, .6, true) - nativeStop(kind, .68, true);
      console.log(JSON.stringify({ kind, gain, mockedGain }));
      // The rubbered groove neither erases nor doubles the bias gain of the bare surface.
      expect(gain).toBeGreaterThan(.15);
      expect(gain).toBeLessThan(.6);
      expect(Math.abs(gain - mockedGain)).toBeLessThan(.25 * mockedGain);
    });

    it(`${kind}: applies pressure, tyre, flat spot, rubber and damage once while retaining bias and fade`, () => {
      const v = new Vehicle(CAR_SPECS[kind], track, kerbs);
      v.stint.reset({ fuelL: 132, compound: 'hard', tempC: 65, wear: .3 }); v.reset(4350, 0);
      v.setup = { ...defaultSetup(kind), frontPressureKpa: 120, rearPressureKpa: 165, brakeBiasFront: .64 };
      v.brakes.reset(820);
      for (let w = 0; w < 4; w++) v.flatSpots.advance(w, 2, 50, 4000, 'road', .3 + w * .2);
      Object.assign(v.damage, { left: .2, right: .7, suspension: .6 });
      v.trackGrip.advance(600, 30);
      const grips = v.stint.tyres.map((w) => w.grip), spots = v.flatSpots.tyres.map((w) => w.gripMultiplier);
      const fades = v.brakes.discs.map((d) => d.forceMultiplier);
      const force = vi.spyOn(tyre, 'tyreForces'), rubber = vi.spyOn(v.trackGrip, 'at');
      try {
        v.vx = Math.sin(v.heading) * 30; v.vz = Math.cos(v.heading) * 30;
        expect(v.step({ ...neutral, brake: .05, steer: .2 }, DT)).toHaveLength(0);
        expect(force).toHaveBeenCalledTimes(4); expect(rubber).toHaveBeenCalledTimes(4);
        force.mock.calls.forEach((call, w) => {
          const front = w < 2, [i, t, d, surface] = rubber.mock.calls[w];
          expect(surface).toBe('road');
          const groove = .99 + .0225 * rubberAmount(sampleArray(track, line.offset, i, t), d);
          const sideDamage = w % 2 === 0 ? .2 : .7;
          const mu = v.spec.tyreMu * v.handling.grip * (front ? 1 : v.handling.rearGrip)
            * tyre.SURFACE[surface].grip * pressureGrip(front ? 120 : 165) * grips[w] * spots[w]
            * groove * (1 - .18 * sideDamage * .6);
          expect(call[1]).toBeCloseTo(mu, 12);
          const bias = front ? .64 : 1 - .64;
          expect(call[5]).toBeCloseTo(.05 * v.spec.maxBrakeTorqueNm * bias / v.spec.brakeBiasFront
            / v.spec.dimensions.wheelRadius * fades[w], 12);
        });
      } finally { force.mockRestore(); rubber.mockRestore(); }
      expect(v.massKg).toBeCloseTo(v.spec.massKg + (v.stint.fuel.litres - 80) * .75, 12);
      expect(v.spec).toBe(CAR_SPECS[kind]);
    });
  }

  it('preserves the whole used stint during recovery and tyre replacement, then starts a clean selected set on grid', () => {
    const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
    v.stint.reset({ fuelL: 35, compound: 'soft', tempC: 118, wear: .3 }); v.reset(4350, 0);
    v.setup = { ...defaultSetup('camaro'), frontPressureKpa: 125, rearArbNpm: 34000 };
    v.brakes.reset(820); v.brakes.advance(0, 5e5, 30, 1);
    for (let w = 0; w < 4; w++) v.flatSpots.advance(w, 2, 50, 4000, 'road', .8);
    v.trackGrip.advance(600, 30);
    const initial = 1.005, used = v.trackGrip.at(30, 0, line.offset[30], 'road');
    const setup = v.setup, fuel = v.stint.fuel.litres, tyres = v.stint.tyres.map((w) => ({ ...w }));
    const brakes = v.brakes.discs.map((w) => ({ ...w })), spots = v.flatSpots.tyres.map((w) => ({ ...w }));
    const refs = [v.telemetry.tyres, v.telemetry.brakes, v.telemetry.flatSpots];
    const entity = { vehicle: v, reset: (s: number, d: number) => v.reset(s, d), repair: () => v.repair() } as unknown as CarEntity;
    const session = new RaceSession('camaro', track, line, entity, 'hard');
    session.resetToTrack();
    expect(v.trackGrip.at(30, 0, line.offset[30], 'road')).toBe(used);
    expect(v.setup).toBe(setup); expect(v.stint.fuel.litres).toBe(fuel); expect(v.stint.tyres).toEqual(tyres);
    expect(v.brakes.discs).toEqual(brakes); expect(v.flatSpots.tyres).toEqual(spots);
    v.stint.fitTyres('hard');
    expect(v.stint.fuel.litres).toBe(fuel); expect(v.brakes.discs).toEqual(brakes);
    expect(v.flatSpots.tyres.every((w) => w.severity === 0 && w.gripMultiplier === 1)).toBe(true);
    expect(v.trackGrip.at(30, 0, line.offset[30], 'road')).toBe(used);
    session.placeOnGrid();
    expect(v.trackGrip.at(30, 0, line.offset[30], 'road')).toBeCloseTo(initial, 12);
    expect(v.setup).toBe(setup); expect(v.stint.fuel.litres).toBe(80);
    expect(v.stint.tyreModel.compound).toBe('hard'); expect(v.stint.tyres.every((w) => w.tempC === 52 && w.wear === 0)).toBe(true);
    expect(v.brakes.discs.every((w) => w.tempC === BRAKE_AMBIENT_C && w.energyJ === 0)).toBe(true);
    expect(v.telemetry.tyres).toBe(refs[0]); expect(v.telemetry.brakes).toBe(refs[1]); expect(v.telemetry.flatSpots).toBe(refs[2]);
  });
});
