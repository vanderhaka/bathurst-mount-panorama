import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, MEASURED_HANDLING, sanitiseHandling, tunedSpec } from '@/config/handling';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { DEFAULT_CURVE, lateralCurve, makeTyreCurve, tyreForces, type TyreResult } from '@/physics/tyre';
import { Vehicle } from '@/physics/vehicle';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const out = (): TyreResult => ({ fx: 0, fy: 0, use: 0, absActive: false, tcActive: false });

describe('tyre curve from the handling values', () => {
  it('peaks at the peak slip angle and falls to the slide grip in a full slide', () => {
    const k = makeTyreCurve(0.12, 0.8);
    expect(lateralCurve(0.12, k)).toBeCloseTo(1, 6);
    expect(lateralCurve(0.09, k)).toBeLessThan(1);
    expect(lateralCurve(0.16, k)).toBeLessThan(1);
    expect(lateralCurve(1e6, k)).toBeCloseTo(0.8, 4);
  });

  it('falls back to the measured warm-slick curve (peak 6.3 degrees, 59 % in a slide)', () => {
    expect(DEFAULT_CURVE.c).toBeCloseTo(1.6, 2);
    expect(DEFAULT_CURVE.b).toBeGreaterThan(13.4);
    expect(DEFAULT_CURVE.b).toBeLessThan(13.7);
    expect(MEASURED_HANDLING.peakSlipDeg).toBeCloseTo((DEFAULT_CURVE.peak * 180) / Math.PI, 6);
    expect(MEASURED_HANDLING.slideGrip).toBe(DEFAULT_CURVE.slide);
  });

  it('keeps more side force past the limit with a higher slide grip', () => {
    const w = Math.tan(0.4) * 30; // 0.4 rad slip angle at 30 m/s
    const loose = tyreForces(5000, 1.6, 30, w, 0, 0, false, false, 500, 1 / 360, out(), makeTyreCurve(0.11, 0.59));
    const grippy = tyreForces(5000, 1.6, 30, w, 0, 0, false, false, 500, 1 / 360, out(), makeTyreCurve(0.11, 0.85));
    expect(Math.abs(grippy.fy)).toBeGreaterThan(Math.abs(loose.fy) * 1.1);
  });
});

describe('handling config', () => {
  it('drops unknown keys and non-numbers, and clamps values to the tuner ranges', () => {
    expect(sanitiseHandling({ grip: 9, rearGrip: 'x', slideGrip: 0.7, other: 1, downforce: Number.NaN })).toEqual({ grip: 1.4, slideGrip: 0.7 });
    expect(sanitiseHandling(null)).toEqual({});
  });

  it('applies grip and downforce to the spec for the racing-line profile', () => {
    const spec = CAR_SPECS.camaro;
    expect(tunedSpec(spec, MEASURED_HANDLING).tyreMu).toBe(spec.tyreMu);
    expect(tunedSpec(spec, MEASURED_HANDLING).clA).toBe(spec.clA);
    const t = tunedSpec(spec, { ...MEASURED_HANDLING, grip: 1.1, rearGrip: 1.1, downforce: 1.2 });
    expect(t.tyreMu).toBeCloseTo(spec.tyreMu * 1.1 * 1.05, 6);
    expect(t.clA).toBeCloseTo(spec.clA * 1.2, 6);
  });
});

describe('default handling', () => {
  it('is the feel the user tuned on 2026-10-07', () => {
    expect(DEFAULT_HANDLING).toEqual({ grip: 1.2, rearGrip: 1.1, slideGrip: 0.89, peakSlipDeg: 9.1, downforce: 1.1, steerSpeedDeg: 149 });
  });
});

describe('reset to track', () => {
  it('puts a damaged car back on the racing line, repaired, and invalidates the lap', () => {
    const track = new Track();
    const line = computeRacingLine(track);
    const vehicle = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, line));
    const entity = { vehicle, reset: (s: number, d: number) => vehicle.reset(s, d), repair: () => vehicle.repair() } as unknown as CarEntity;
    const session = new RaceSession('camaro', track, line, entity);
    vehicle.reset(2500, 9);
    Object.assign(vehicle.damage, { front: 0.8, left: 0.6, suspension: 0.5, aero: 0.4, engine: 0.3 });
    session.timer.startStandingLap();
    session.timer.update(1, track.length * 0.6);
    session.resetToTrack();
    expect(Object.values(vehicle.damage).every((x) => x === 0)).toBe(true);
    const i = Math.round(track.wrapS(vehicle.tp.s) / track.spacing) % track.n;
    expect(Math.abs(vehicle.tp.d - line.offset[i])).toBeLessThan(0.5);
    expect(session.timer.valid).toBe(false);
    expect(session.currentMessage()?.text).toContain('REPAIRED');
  });
});
