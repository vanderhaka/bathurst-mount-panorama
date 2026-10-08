import { describe, expect, it } from 'vitest';
import { CAR_SPECS, circuitCarSpec } from '@/car/car-specs';
import { SessionProfiles } from '@/game/session-profiles';
import { tyreForces, type TyreResult } from '@/physics/tyre';
import { tyreHeat, type TyreHeatInput } from '@/physics/tyre-heat';
import { TYRE_COMPOUNDS, TYRE_MAX_C, TyreModel } from '@/physics/tyre-state';
import type { VehicleInput } from '@/physics/types';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const DT = 1 / 360;
const result = (): TyreResult => ({ fx: 0, fy: 0, use: 0, slide: 0, absActive: false, tcActive: false });
const idle = (): VehicleInput => ({ throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false });

describe('slide heat is bounded by the friction work of a sliding tyre', () => {
  it('reports a locked wheel as one full slide however hard the brake is pressed, and no slide below the peak', () => {
    const light = tyreForces(4000, 1.6, 50, 0, 0, 7000, false, false, 400, DT, result());
    const heavy = tyreForces(4000, 1.6, 50, 0, 0, 2e6, false, false, 400, DT, result());
    expect(light.use).toBeGreaterThan(1);
    expect(heavy.use).toBeGreaterThan(100);
    expect(light.slide).toBeCloseTo(0.86, 6);
    expect(heavy.slide).toBe(light.slide);
    const gripping = tyreForces(4000, 1.6, 50, 50 * Math.tan(0.05), 0, 0, false, false, 400, DT, result());
    expect(gripping.slide).toBe(0);
    const sliding = tyreForces(4000, 1.6, 50, 50 * Math.tan(0.3), 0, 0, false, false, 400, DT, result());
    expect(sliding.slide).toBeGreaterThan(0);
    expect(sliding.slide).toBeLessThan(0.86);
  });

  it('heats a wheel no more at a 300x lock-up demand than at any other full slide', () => {
    const base: TyreHeatInput = { throttle: 0, brake: 1, steer: 0, gLat: 0, gLong: -1 };
    const at = (slip: number) => tyreHeat({ ...base, wheels: [0, 1, 2, 3].map(() => ({ load: 3500, slip })) }, 79, [0, 0, 0, 0])[2];
    expect(at(300)).toBe(at(20));
    expect(Number.isFinite(at(1e9))).toBe(true);
  });

  it('never lets a tyre exceed the physical ceiling, and caps overheated wear', () => {
    const model = new TyreModel('soft', 95);
    const input: TyreHeatInput = { throttle: 1, brake: 0, steer: 0, gLat: 2.2, gLong: 0, wheels: [0, 1, 2, 3].map(() => ({ load: 3500, slip: 1e6, slide: 0.86 })) };
    let maxWearPerS = 0;
    for (let i = 0; i < 600; i++) {
      const before = model.tyres[0].wear;
      model.advance(input, 80, 0.1);
      maxWearPerS = Math.max(maxWearPerS, (model.tyres[0].wear - before) / 0.1);
      for (const tyre of model.tyres) expect(tyre.tempC).toBeLessThanOrEqual(TYRE_MAX_C);
    }
    const heat = tyreHeat(input, 80, [0, 0, 0, 0])[0];
    expect(maxWearPerS).toBeLessThanOrEqual(TYRE_COMPOUNDS.soft.wearRate * heat * 3 + 1e-12);
  });
});

describe('tyre temperatures stay physical on the real physics', () => {
  it('keeps an ABS-off lock-up from Conrod Straight top speed below the ceiling', () => {
    const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
    const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
    v.stint.reset({ tempC: 95 });
    const probe = new SessionProfiles(v, line).player;
    let top = 0;
    for (let i = 0; i < probe.speed.length; i++) if (probe.speed[i] > probe.speed[top]) top = i;
    const target = track.wrapS(top * track.spacing - 150), s0 = track.wrapS(target - 1500);
    v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
    const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai), input = idle();
    for (let k = 0; k < 360 * 200 && Math.abs(track.wrapS(v.tp.s - target)) > 3; k++) { profiles.update(); ap.drive(v, input); v.step(input, DT); }
    v.assists = { ...v.assists, abs: false };
    const v0 = v.speed, wear0 = v.stint.tyres.map((tyre) => tyre.wear);
    let maxC = 0, maxStepC = 0, maxSlip = 0;
    while (v.speed > 15) {
      ap.drive(v, input);
      input.throttle = 0; input.brake = 1;
      const before = v.stint.tyres.map((tyre) => tyre.tempC);
      v.step(input, DT);
      v.stint.tyres.forEach((tyre, w) => {
        maxC = Math.max(maxC, tyre.tempC);
        maxStepC = Math.max(maxStepC, tyre.tempC - before[w]);
        maxSlip = Math.max(maxSlip, v.wheels[w].slip);
      });
    }
    const wear = v.stint.tyres.map((tyre, w) => tyre.wear - wear0[w]);
    console.log(JSON.stringify({ v0, maxSlip, maxC, maxStepC, wear, temps: v.stint.tyres.map((tyre) => tyre.tempC) }));
    expect(v0).toBeGreaterThan(75);
    expect(maxSlip).toBeGreaterThan(10); // the rears really lock
    expect(maxC).toBeLessThanOrEqual(TYRE_MAX_C);
    expect(maxStepC).toBeLessThan(1);
    expect(Math.max(...wear)).toBeLessThan(0.05);
  }, 60000);

  // The soft fronts come up through their window on the first flying lap and settle a little above
  // it; from then on neither the temperatures nor the lap times may keep climbing (a slide-heat
  // feedback loop once took the front-left from 93 to 221 C and the laps from 78.8 to 84.4 s).
  it('settles the fronts over a 12-lap Adelaide soft stint without lap times drifting', () => {
    const track = createAdelaideTrack(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
    const v = new Vehicle(circuitCarSpec('camaro', 'adelaide'), track, kerbs);
    v.stint.reset({ compound: 'soft' });
    v.reset(track.gridLineS - 7, -2.2);
    const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai), input = idle();
    let t = 0, driven = 0, prev = v.tp.s, lapStart = 0, maxFront = 0;
    const laps: number[] = [], fronts: number[] = [];
    while (laps.length < 12 && t < 1500) {
      profiles.update(); ap.drive(v, input); v.step(input, DT); t += DT;
      let ds = v.tp.s - prev;
      if (ds > track.length / 2) ds -= track.length;
      else if (ds <= -track.length / 2) ds += track.length;
      driven += ds; prev = v.tp.s;
      maxFront = Math.max(maxFront, v.stint.tyres[0].tempC, v.stint.tyres[1].tempC);
      if (driven >= (laps.length + 1) * track.length) {
        laps.push(t - lapStart); lapStart = t;
        fronts.push(Math.max(v.stint.tyres[0].tempC, v.stint.tyres[1].tempC));
      }
    }
    const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
    const lastSix = laps.slice(6);
    console.log(JSON.stringify({ laps, fronts, maxFront, wear: v.stint.tyres.map((tyre) => tyre.wear) }));
    expect(laps).toHaveLength(12);
    expect(Math.max(...lastSix) - Math.min(...lastSix)).toBeLessThan(1.5);
    expect(mean(laps.slice(9)) - mean(laps.slice(2, 5))).toBeLessThan(1.5);
    expect(Math.abs(fronts[11] - fronts[7])).toBeLessThan(5);
    expect(Math.max(...fronts)).toBeLessThan(140);
  }, 120000);
});
