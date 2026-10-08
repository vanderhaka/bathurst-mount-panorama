import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';

const track = createAdelaideTrack(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const DT = 1 / 360;
/** Dequetteville hairpin (T9, about 13 m radius): the inside wall is 1.65 m beyond the edge. */
const HAIRPIN = [2215, 2260];

// The AI measured its heading error on the segment after the nearest 4 m line sample, up to 4 m
// ahead of the front axle. On this hairpin that steered it 1.2 m inside its line and onto the inside
// wall on most warm-tyre laps; an overheating front-left had been hiding it by slowing the car.
describe('the AI tracks Adelaide hairpins on warm tyres', () => {
  for (const kind of ['camaro', 'mustang', 'supra'] as CarKind[]) {
    it(`keeps the ${kind} on its line through Dequetteville without touching the wall`, () => {
      const v = new Vehicle(CAR_SPECS[kind], track, kerbs);
      v.stint.reset({ tempC: 95 });
      v.reset(0, line.offset[0]);
      const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai);
      const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      let driven = 0, previous = v.tp.s, maxImpact = 0, inside = 0;
      for (let step = 0; step < 360 * 400 && driven < 4 * track.length; step++) {
        profiles.update();
        ap.drive(v, input);
        for (const impact of v.step(input, DT)) maxImpact = Math.max(maxImpact, impact.speed);
        let ds = v.tp.s - previous;
        if (ds > track.length / 2) ds -= track.length;
        else if (ds <= -track.length / 2) ds += track.length;
        driven += ds;
        previous = v.tp.s;
        if (v.tp.s > HAIRPIN[0] && v.tp.s < HAIRPIN[1]) {
          const i = v.tp.index, j = (i + 1) % track.n;
          const lineD = line.offset[i] + (line.offset[j] - line.offset[i]) * v.tp.t;
          inside = Math.max(inside, lineD - v.tp.d); // right-hander: inside = more negative d
        }
      }
      console.log(JSON.stringify({ kind, laps: driven / track.length, maxImpact, inside }));
      expect(driven).toBeGreaterThan(4 * track.length - 1);
      expect(maxImpact).toBeLessThan(1);
      expect(inside).toBeLessThan(1);
    });
  }
});

// Adelaide counterpart of tests/line-follower.test.ts: a beginner who only obeys the racing-line
// colours must lap without hitting a wall or leaving the road (it hit the Final Hairpin wall before).
describe('Adelaide racing-line colours are achievable', () => {
  for (const kind of ['camaro', 'mustang', 'supra'] as CarKind[]) {
    it(`a colour-following driver laps cleanly in the ${kind}`, () => {
      const spec = CAR_SPECS[kind];
      const prof = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), LINE_PROFILE);
      const v = new Vehicle(spec, track, kerbs);
      const steer = new Autopilot(track, line, prof);
      v.reset(100, line.offset[Math.round(100 / track.spacing)]);
      const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      let maxImpact = 0, worstOff = 0, driven = 0, previous = v.tp.s;
      for (let k = 0; k < 360 * 150 && driven < track.length + 200; k++) {
        steer.drive(v, input); // steering only; the pedals come from the line colours
        const s = v.tp.s, speed = Math.max(0, v.speed);
        let r = -Infinity;
        for (let d = 6; d <= 30; d += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], speed, d));
        input.brake = r > LINE_RED ? 1 : 0;
        input.throttle = r > LINE_YELLOW ? 0 : 1;
        for (const impact of v.step(input, DT)) maxImpact = Math.max(maxImpact, impact.speed);
        const side = v.tp.d >= 0 ? track.left : track.right;
        worstOff = Math.max(worstOff, Math.abs(v.tp.d) - side.edge[v.tp.index]);
        let ds = v.tp.s - previous;
        if (ds < -track.length / 2) ds += track.length;
        driven += Math.max(0, ds);
        previous = v.tp.s;
      }
      expect(driven).toBeGreaterThan(track.length);
      expect(maxImpact).toBeLessThan(1);
      expect(worstOff).toBeLessThan(1);
    });
  }
});
