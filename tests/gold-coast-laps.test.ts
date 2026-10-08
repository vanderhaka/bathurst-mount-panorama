import { describe, expect, it } from 'vitest';
import { circuitCarSpec, type CarKind } from '@/car/car-specs';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { createGoldCoastTrack } from '@/track/gold-coast';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';

const track = createGoldCoastTrack(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);

describe('Gold Coast is drivable with the unchanged cars', () => {
  for (const kind of ['camaro', 'mustang', 'supra'] as CarKind[]) {
    it(`completes three laps in the ${kind} without a wall impact`, () => {
      const v = new Vehicle(circuitCarSpec(kind, 'gold-coast'), track, kerbs);
      const profiles = new SessionProfiles(v, line);
      const ap = new Autopilot(track, line, profiles.ai);
      v.reset(0, line.offset[0]);
      const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      let driven = 0, previous = v.tp.s, elapsed = 0, lastLap = 0, maxImpact = 0, worstOff = 0;
      const laps: number[] = [];
      for (let step = 0; step < 360 * 330 && laps.length < 3; step++) {
        ap.drive(v, input);
        for (const impact of v.step(input, 1 / 360)) maxImpact = Math.max(maxImpact, impact.speed);
        profiles.update();
        let delta = v.tp.s - previous;
        if (delta < -track.length / 2) delta += track.length;
        if (delta > track.length / 2) delta -= track.length;
        driven += delta;
        elapsed += 1 / 360;
        previous = v.tp.s;
        const side = v.tp.d >= 0 ? track.left : track.right;
        worstOff = Math.max(worstOff, Math.abs(v.tp.d) - side.edge[v.tp.index]);
        if (driven >= (laps.length + 1) * track.length) { laps.push(elapsed - lastLap); lastLap = elapsed; }
      }
      console.log(JSON.stringify({ circuit: 'gold-coast', car: kind, laps, maxImpact, worstOff }));
      expect(laps).toHaveLength(3);
      expect(maxImpact).toBeLessThan(1);
      expect(worstOff).toBeLessThan(1.05);
      expect(laps[1]).toBeGreaterThan(60);
      expect(laps[1]).toBeLessThan(88);
    }, 60000);
  }
});
