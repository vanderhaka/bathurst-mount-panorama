import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);

// A beginner who only obeys the racing-line colours (full brake on red, lift on
// yellow, full throttle on green) must lap without hitting a wall or leaving the road.
describe('racing-line colours are achievable', () => {
  for (const kind of ['camaro', 'mustang'] as CarKind[]) {
    it(`a colour-following driver laps cleanly in the ${kind}`, () => {
      const spec = CAR_SPECS[kind];
      const prof = computeSpeedProfile(track, line, spec, LINE_PROFILE);
      const v = new Vehicle(spec, track, kerbs);
      const steer = new Autopilot(track, line, prof);
      v.reset(100, line.offset[Math.round(100 / track.spacing)]);
      const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      let maxImpact = 0, worstOff = 0, driven = 0, prevS = v.tp.s;
      for (let k = 0; k < 360 * 150 && driven < track.length + 200; k++) {
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
