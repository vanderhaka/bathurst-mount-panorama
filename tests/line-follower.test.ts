import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';
import { colourLaps } from './colour-driver-fixture';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);

// A beginner who only obeys the racing-line colours (full brake on red, lift on
// yellow, full throttle on green) must lap without hitting a wall or leaving the road.
describe('racing-line colours are achievable', () => {
  for (const kind of ['camaro', 'mustang', 'supra', 'torana'] as CarKind[]) {
    it(`a colour-following driver laps cleanly in the ${kind}`, () => {
      const spec = CAR_SPECS[kind];
      // The game's racing line: the line profile for the default handling (world.ts, profile-cache.ts).
      const prof = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), LINE_PROFILE);
      const v = new Vehicle(spec, track, kerbs);
      const steer = new Autopilot(track, line, prof);
      v.reset(100, line.offset[Math.round(100 / track.spacing)]);
      const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      let maxImpact = 0, worstOff = 0, driven = 0, prevS = v.tp.s;
      // Simulation cap: 150 s, or 1.3 of the car's line-profile lap for a slower car (the 1979 Torana).
      const capS = Math.max(150, prof.lapTimeS * 1.3);
      for (let k = 0; k < 360 * capS && driven < track.length + 200; k++) {
        steer.drive(v, inp); // steering only; the pedals come from the line colours
        const s = v.tp.s, sp = Math.max(0, v.speed);
        let r = -Infinity;
        for (let d = 6; d <= 30; d += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], sp, d));
        inp.brake = r > LINE_RED ? 1 : 0;
        inp.throttle = r > LINE_YELLOW ? 0 : 1;
        for (const im of v.step(inp, 1 / 360)) maxImpact = Math.max(maxImpact, im.speed);
        const side = v.tp.d >= 0 ? track.left : track.right;
        worstOff = Math.max(worstOff, Math.abs(v.tp.d) - side.edge[v.tp.index]);
        let ds = v.tp.s - prevS;
        if (ds < -track.length / 2) ds += track.length;
        driven += Math.max(0, ds);
        prevS = v.tp.s;
      }
      expect(driven).toBeGreaterThan(track.length);
      expect(maxImpact).toBeLessThan(1);
      expect(worstOff).toBeLessThan(1);
    });
  }
});

// Race-warm tyres over two laps from the grid, on the race's live guidance. The outside front runs hot
// (FR about 125 C into Forrest's Elbow on lap 2); guidance cornering on the four-tyre mean promised grip
// it no longer had, and the car pushed wide at full lock into the wall at 6.3 m/s.
describe('racing-line colours are achievable on race-warm tyres', () => {
  for (const kind of ['camaro', 'mustang', 'supra', 'torana'] as CarKind[]) {
    it(`a colour-following driver laps the ${kind} twice cleanly`, () => {
      const run = colourLaps(track, line, kerbs, CAR_SPECS[kind], 2);
      console.log(JSON.stringify({ circuit: 'bathurst', kind, ...run }));
      expect(run.driven).toBeGreaterThan(2 * track.length);
      expect(run.maxImpact).toBeLessThan(1);
      expect(run.worstOff).toBeLessThan(1);
    }, 60000);
  }
});
