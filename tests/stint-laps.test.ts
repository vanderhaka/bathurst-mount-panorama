import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import type { StintStart } from '@/physics/vehicle-stint';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const DT = 1 / 360;
interface Lap { timeS: number; fuelL: number; wear: number; temps: number[]; grip: number }

/** Real owned runtime profiles: same one-second fixed-simulation refresh as the game. */
function laps(start: StintStart, count: number, standing = false): { laps: Lap[]; maxImpact: number } {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.stint.reset(start);
  const s0 = standing ? track.startLineS + 2 * track.spacing : track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const profiles = new SessionProfiles(v, line);
  const ap = new Autopilot(track, line, profiles.ai);
  const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let t = 0, prevS = v.tp.s, lapStart = 0, crossed = standing, maxImpact = 0;
  const result: Lap[] = [];
  while (result.length < count && t < (count + 1) * 180) {
    profiles.update();
    ap.drive(v, input);
    for (const impact of v.step(input, DT)) maxImpact = Math.max(maxImpact, impact.speed);
    t += DT;
    const s = v.tp.s;
    if (prevS < track.startLineS && s >= track.startLineS && s - prevS < 50) {
      if (crossed) result.push({
        timeS: t - lapStart, fuelL: v.stint.fuel.litres,
        wear: v.stint.tyres.reduce((sum, tyre) => sum + tyre.wear, 0) / 4,
        temps: v.stint.tyres.map((tyre) => tyre.tempC),
        grip: v.stint.tyres.reduce((sum, tyre) => sum + tyre.grip, 0) / 4,
      });
      crossed = true;
      lapStart = t;
    }
    prevS = s;
  }
  expect(result).toHaveLength(count);
  expect(maxImpact).toBeLessThan(1);
  return { laps: result, maxImpact };
}

describe('measured AI tyre stint pace', () => {
  it('keeps the warm reference car near 2:04 and makes a cold out-lap slower', () => {
    const cold = laps({ fuelL: 80, tempC: 52 }, 1, true);
    const warm = laps({ fuelL: 80, tempC: 95 }, 1, true);
    const flying = laps({ fuelL: 80, tempC: 95 }, 1);
    const coldDeltaS = cold.laps[0].timeS - warm.laps[0].timeS;
    console.log(JSON.stringify({ cold, warm, flying, coldDeltaS }));
    expect(flying.laps[0].timeS).toBeGreaterThan(123);
    expect(flying.laps[0].timeS).toBeLessThan(125);
    expect(coldDeltaS).toBeGreaterThan(0.02);
    expect(cold.laps[0].timeS).toBeGreaterThan(flying.laps[0].timeS);
  }, 60000);

  it('loses pace through a long stint even while burning fuel', () => {
    const stint = laps({ fuelL: 132, tempC: 95 }, 22);
    const early = stint.laps[1], late = stint.laps.at(-1)!;
    console.log(JSON.stringify({ early, late, stintDeltaS: late.timeS - early.timeS, maxImpact: stint.maxImpact }));
    expect(late.fuelL).toBeGreaterThan(0);
    expect(late.fuelL).toBeLessThan(early.fuelL);
    expect(late.wear).toBeGreaterThan(early.wear + 0.08);
    expect(late.grip).toBeLessThan(early.grip);
    expect(late.timeS).toBeGreaterThan(early.timeS + 0.1);
  }, 60000);
});
