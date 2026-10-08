import type { CarSpec } from '@/car/car-specs';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import type { KerbLayout } from '@/track/kerbs';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';

export interface ColourRun { driven: number; maxImpact: number; worstOff: number; guidanceLapS: number }

/**
 * A beginner who only obeys the racing-line colours (full brake on red, lift on yellow, full throttle on
 * green) from the grid on race-warm tyres. The colours come from the race's own live guidance
 * (SessionProfiles.player, refreshed once per simulated second); the Autopilot only steers.
 */
export function colourLaps(track: Track, line: RacingLine, kerbs: KerbLayout, spec: CarSpec, laps: number): ColourRun {
  const v = new Vehicle(spec, track, kerbs);
  v.stint.reset({ tempC: 95 });
  const s0 = track.wrapS(track.gridLineS - 7);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const profiles = new SessionProfiles(v, line), prof = profiles.player, steer = new Autopilot(track, line, prof);
  const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  let maxImpact = 0, worstOff = 0, driven = 0, previous = v.tp.s, guidance = 0, refreshes = 0;
  for (let k = 0; k < 360 * 150 * laps && driven < laps * track.length + 200; k++) {
    profiles.update();
    if (k % 360 === 0) { guidance += prof.lapTimeS; refreshes++; }
    steer.drive(v, input); // steering only; the pedals come from the line colours
    const s = v.tp.s, speed = Math.max(0, v.speed);
    let r = -Infinity;
    for (let d = 6; d <= 30; d += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], speed, d));
    input.brake = r > LINE_RED ? 1 : 0;
    input.throttle = r > LINE_YELLOW ? 0 : 1;
    for (const impact of v.step(input, 1 / 360)) maxImpact = Math.max(maxImpact, impact.speed);
    const side = v.tp.d >= 0 ? track.left : track.right;
    worstOff = Math.max(worstOff, Math.abs(v.tp.d) - side.edge[v.tp.index]);
    let ds = v.tp.s - previous;
    if (ds < -track.length / 2) ds += track.length;
    driven += Math.max(0, ds);
    previous = v.tp.s;
  }
  return { driven, maxImpact, worstOff, guidanceLapS: guidance / refreshes };
}
