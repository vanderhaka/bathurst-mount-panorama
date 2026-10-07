import { expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

it('normal multi-lap driving warms independent discs, cools them on straights and keeps ABS tyres intact', () => {
  const track = new Track(), line = computeRacingLine(track), DT = 1 / 360;
  const v = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, line));
  v.stint.reset({ fuelL: 80, tempC: 52 });
  const s0 = track.wrapS(track.startLineS - 300);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai);
  const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  const laps: Array<{ timeS: number; peakC: number; endC: number[]; workJ: number; fuelL: number }> = [];
  const collisions: Array<{ timeS: number; s: number; speed: number; temps: number[] }> = [];
  let t = 0, prevS = v.tp.s, lapStart = 0, crossed = false, peak = 22, impacts = 0, coolingSteps = 0;
  while (laps.length < 3 && t < 4 * 180) {
    profiles.update(); ap.drive(v, input);
    const before = v.brakes.discs[0].tempC;
    const hits = v.step(input, DT);
    impacts += hits.length;
    for (const hit of hits) collisions.push({ timeS: t, s: v.tp.s, speed: hit.speed, temps: v.brakes.discs.map((disc) => disc.tempC) });
    t += DT;
    if (input.brake === 0 && v.speed > 50 && v.brakes.discs[0].tempC < before) coolingSteps++;
    peak = Math.max(peak, ...v.brakes.discs.map((disc) => disc.tempC));
    const s = v.tp.s;
    if (prevS < track.startLineS && s >= track.startLineS && s - prevS < 50) {
      if (crossed) laps.push({ timeS: t - lapStart, peakC: peak, endC: v.brakes.discs.map((disc) => disc.tempC),
        workJ: v.brakes.discs.reduce((sum, disc) => sum + disc.energyJ, 0), fuelL: v.stint.fuel.litres });
      crossed = true; lapStart = t; peak = 22;
    }
    prevS = s;
  }
  console.log(JSON.stringify({ normalBrakeLaps: laps, impacts, coolingSteps, collisions }));
  expect(laps).toHaveLength(3); expect(impacts).toBe(0); expect(coolingSteps).toBeGreaterThan(360);
  expect(laps.every((lap) => lap.timeS > 120 && lap.timeS < 135 && lap.peakC > 150 && lap.peakC < 700)).toBe(true);
  expect(laps[2].workJ).toBeGreaterThan(laps[0].workJ + 1e7);
  expect(laps[2].fuelL).toBeLessThan(laps[0].fuelL);
  expect(new Set(laps[2].endC.map((value) => Math.round(value))).size).toBeGreaterThan(1);
  expect(v.brakes.discs.every((disc) => disc.forceMultiplier === 1)).toBe(true);
  expect(v.flatSpots.tyres.every((tyre) => tyre.severity === 0)).toBe(true);
}, 60000);
