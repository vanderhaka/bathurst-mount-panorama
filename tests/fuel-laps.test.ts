import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { computeSpeedProfile } from '@/track/speed-profile';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const DT = 1 / 360;
function lap(fuelL: number, fixedTarget = false): { timeS: number; fuelL: number; maxImpact: number } {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.stint.reset({ fuelL, tempC: 95 });
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const profiles = new SessionProfiles(v, line);
  const target = fixedTarget ? computeSpeedProfile(track, line, tunedSpec(v.spec, DEFAULT_HANDLING), AI_PROFILE) : profiles.ai;
  const ap = new Autopilot(track, line, target);
  const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let t = 0, prevS = v.tp.s, lapStart = 0, crossings = 0, maxImpact = 0;
  while (t < 200) {
    if (!fixedTarget) profiles.update();
    ap.drive(v, input);
    for (const impact of v.step(input, DT)) maxImpact = Math.max(maxImpact, impact.speed);
    t += DT;
    const s = v.tp.s;
    if (prevS < track.startLineS && s >= track.startLineS && s - prevS < 50) {
      if (++crossings === 2) return { timeS: t - lapStart, fuelL: v.stint.fuel.litres, maxImpact };
      lapStart = t;
    }
    prevS = s;
  }
  throw new Error('AI did not complete the measured flying lap');
}
describe('fuel affects complete AI lap pace', () => {
  it('keeps the reference car near 2:04 and separates ordinary and extreme fuel loads', () => {
    const normal = lap(80), full = lap(132), light = lap(15);
    const fuelDeltaS = full.timeS - light.timeS;
    console.log(JSON.stringify({ normal, full, light, fuelDeltaS, fullReferenceDeltaS: full.timeS - normal.timeS }));
    expect(normal.timeS).toBeGreaterThan(123);
    expect(normal.timeS).toBeLessThan(125);
    expect(fuelDeltaS).toBeGreaterThan(0.1);
    expect(fuelDeltaS).toBeLessThan(1.1);
    expect(full.timeS - normal.timeS).toBeGreaterThan(0.2);
    expect(full.timeS - normal.timeS).toBeLessThan(0.7);
    for (const run of [normal, full, light]) expect(run.maxImpact).toBeLessThan(1);
  }, 60000);

  it('isolates full/light fuel with identical driver target speeds', () => {
    const full = lap(132, true), light = lap(15, true);
    const controlledFuelDeltaS = full.timeS - light.timeS;
    console.log(JSON.stringify({ full, light, controlledFuelDeltaS }));
    expect(controlledFuelDeltaS).toBeGreaterThan(0.1);
    expect(controlledFuelDeltaS).toBeLessThan(1);
    expect(full.maxImpact).toBeLessThan(1);
    expect(light.maxImpact).toBeLessThan(1);
  }, 60000);
});
