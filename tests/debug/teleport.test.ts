import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('teleport slip', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const spec = CAR_SPECS.camaro;
  const ai = computeSpeedProfile(track, line, spec, AI_PROFILE); const player = computeSpeedProfile(track, line, spec);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, ai);
  const s = Number(process.env.S0 ?? 2990);
  const i = Math.round(s / track.spacing);
  v.reset(s, line.offset[i]);
  const sp = (process.env.PROF === 'player' ? player : ai).speed[i];
  v.vx = Math.sin(v.heading) * sp; v.vz = Math.cos(v.heading) * sp; v.vy = sp * track.grade[i];
  v.pt.gear = Math.max(1, Math.min(6, Math.round(sp / 14)));
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  for (let k = 0; k < 360 * Number(process.env.SECS ?? 1.5); k++) {
    ap.drive(v, inp);
    v.step(inp, 1 / 360);
    const sn = Math.sin(v.heading), cs = Math.cos(v.heading); const beta = Math.atan2(v.vx * cs - v.vz * sn, v.vx * sn + v.vz * cs) * 57.3; if (k % 30 === 0) console.log(`beta=${beta.toFixed(1)} s=${v.tp.s.toFixed(0)} t=${(k / 360).toFixed(2)} v=${(v.speed * 3.6).toFixed(0)} g=${v.pt.gear} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} slip=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')} load=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')} surf=${v.wheels.map((w) => w.surface[0]).join('')}`);
  }
});
