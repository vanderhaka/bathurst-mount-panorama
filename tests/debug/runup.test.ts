import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('teleport run-up', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const RUN = Number(process.env.RUN ?? 200), SPF = Number(process.env.SPF ?? 0.7);
  for (const kind of ['camaro', 'mustang'] as const) {
    const spec = CAR_SPECS[kind];
    const ai = computeSpeedProfile(track, line, spec, AI_PROFILE);
    for (const target of [200, 1200, 1700, 2470, 3000, 3330, 3600, 4600, 4700, 5380, 6000]) {
      const v = new Vehicle(spec, track, kerbs);
      const s0 = track.wrapS(target - RUN);
      const i = Math.round(s0 / track.spacing) % track.n;
      v.reset(s0, line.offset[i]);
      const sp = ai.speed[i] * SPF;
      v.vx = Math.sin(v.heading) * sp; v.vz = Math.cos(v.heading) * sp; v.vy = sp * track.grade[i];
      v.pt.gear = Math.max(1, Math.min(6, Math.round(sp / 14)));
      const ap = new Autopilot(track, line, ai);
      const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
      let maxBeta = 0, maxSlip = 0, k = 0, impacts = 0;
      // Run-up, then 3 s after arrival.
      let arrived = -1;
      for (; k < 360 * 30; k++) {
        ap.drive(v, inp);
        impacts += v.step(inp, 1 / 360).length;
        const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
        const beta = Math.abs(Math.atan2(v.vx * cs - v.vz * sn, Math.max(1, v.vx * sn + v.vz * cs))) * 57.3;
        let ds = v.tp.s - s0; if (ds < -track.length / 2) ds += track.length; else if (ds > track.length / 2) ds -= track.length;
        if (arrived < 0 && ds >= RUN) arrived = k;
        if (arrived >= 0) {
          maxBeta = Math.max(maxBeta, beta);
          maxSlip = Math.max(maxSlip, ...v.wheels.filter((w) => w.load > 1500).map((w) => w.slip));
          if (k - arrived > 360 * 3) break;
        } else maxBeta = Math.max(maxBeta, beta);
      }
      const arrSpeed = v.speed * 3.6;
      console.log(`${kind} target=${target} arrived=${arrived >= 0 ? (arrived / 360).toFixed(1) + 's' : 'NO'} maxBeta=${maxBeta.toFixed(1)} maxSlip(loaded)=${maxSlip.toFixed(2)} impacts=${impacts} v=${arrSpeed.toFixed(0)} aiTarget=${(ai.speed[Math.round(target / track.spacing) % track.n] * 3.6).toFixed(0)}`);
    }
  }
});
