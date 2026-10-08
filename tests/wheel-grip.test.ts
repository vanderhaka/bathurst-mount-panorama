import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarSpec } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { pressureGrip, setupSpec } from '@/physics/setup-forces';
import { stintSpec } from '@/physics/stint-spec';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const tuned = tunedSpec(CAR_SPECS.camaro, DEFAULT_HANDLING);
/** The tuned car with one tyre's friction scaled (wheel order FL, FR, RL, RR). */
function oneTyre(w: number, scale: number): CarSpec {
  const g = [...tuned.wheelGrip!] as [number, number, number, number];
  g[w] *= scale;
  return { ...tuned, wheelGrip: g };
}
/** Corner samples (below 60 m/s) turning left (+1) or right (-1). */
function corners(dir: 1 | -1): number[] {
  const limit = computeSpeedProfile(track, line, tuned, LINE_PROFILE).cornerLimit, out: number[] = [];
  for (let i = 0; i < track.n; i++) if (limit[i] < 60 && Math.sign(line.curvature[i]) === dir) out.push(i);
  return out;
}

describe('racing-line guidance on each tyre’s own grip', () => {
  it('gives each tyre its handling axle, setup pressure and stint grip exactly once', () => {
    const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
    v.handling = { ...DEFAULT_HANDLING, grip: 1.3, rearGrip: 1.18 };
    v.setup = { ...v.setup, frontPressureKpa: 120, rearPressureKpa: 165 };
    v.stint.reset({ tempC: 95, wear: 0.2 });
    v.stint.tyres[1].grip = 0.85; // an overheated front-right
    const spec = stintSpec(setupSpec(tunedSpec(v.spec, v.handling), v.setup), v.stint);
    expect(spec.wheelGrip).toHaveLength(4);
    spec.wheelGrip!.forEach((g, w) => {
      const front = w < 2;
      const physics = v.spec.tyreMu * v.handling.grip * (front ? 1 : v.handling.rearGrip) * pressureGrip(front ? 120 : 165)
        * v.stint.tyres[w].grip * v.flatSpots.tyres[w].gripMultiplier;
      expect(spec.tyreMu * g).toBeCloseTo(physics, 12);
    });
  });

  it('corners on a hot outside tyre, and on at least half an axle of a hot inside one', () => {
    const hotFrontRight = computeSpeedProfile(track, line, oneTyre(1, 0.9), LINE_PROFILE);
    const asOutside = computeSpeedProfile(track, line, { ...tuned, tyreMu: tuned.tyreMu * 0.9 }, LINE_PROFILE);
    const asInside = computeSpeedProfile(track, line, { ...tuned, tyreMu: tuned.tyreMu * 0.95 }, LINE_PROFILE);
    const left = corners(1), right = corners(-1);
    expect(left.length).toBeGreaterThan(50);
    expect(right.length).toBeGreaterThan(50);
    for (const i of left) expect(hotFrontRight.cornerLimit[i]).toBeCloseTo(asOutside.cornerLimit[i], 3);
    for (const i of right) expect(hotFrontRight.cornerLimit[i]).toBeCloseTo(asInside.cornerLimit[i], 3);
  });

  it('leaves the AI profile on the four-tyre mean', () => {
    const ai = computeSpeedProfile(track, line, oneTyre(1, 0.9), AI_PROFILE);
    expect(ai.speed).toEqual(computeSpeedProfile(track, line, tuned, AI_PROFILE).speed);
  });
});
