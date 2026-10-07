import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { placeKerbs } from '@/track/kerbs';

const DT = 1 / 360;
it('cutting ai trace', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const spec = CAR_SPECS.camaro;
  const prof = computeSpeedProfile(track, line, spec, { gripFactor: 0.86, trailBrakeExp: Number(process.env.TBE ?? 2) });
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, prof);
  const s0 = 1800;
  v.reset(s0, line.offset[Math.round(s0 / track.spacing)]);
  v.vx = 0; // keep defaults
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  // Get up to speed from a rolling start: run from 1500 instead.
  v.reset(1400, line.offset[Math.round(1400 / track.spacing)]);
  let t = 0, last = -1;
  while (t < 60) {
    ap.drive(v, inp);
    const imps = v.step(inp, DT);
    t += DT;
    const s = v.tp.s;
    for (const im of imps) console.log(`IMPACT s=${s.toFixed(1)} speed=${im.speed.toFixed(1)}`);
    if (s > 2150) break;
    if (s > 1960 && s < 2070 && Math.floor(s / 4) !== last) {
      last = Math.floor(s / 4);
      const i = v.tp.index;
      const sn = Math.sin(v.heading), cs = Math.cos(v.heading); const vLat = v.vx * cs - v.vz * sn, vLong = v.vx * sn + v.vz * cs; const th = Math.atan2(track.tx[i], track.tz[i]); let he = v.heading - th; while (he > Math.PI) he -= 2 * Math.PI; while (he < -Math.PI) he += 2 * Math.PI;
      console.log(`beta=${(Math.atan2(vLat, vLong) * 57.3).toFixed(1)} yawR=${v.yawRate.toFixed(2)} hdgVsTrack=${(he * 57.3).toFixed(1)} lineK=${line.curvature[i].toFixed(4)} trackK=${track.curvature[i].toFixed(4)} slips=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')} s=${s.toFixed(0)} v=${(v.speed * 3.6).toFixed(0)} tgt=${(prof.speed[i] * 3.6).toFixed(0)} d=${v.tp.d.toFixed(2)} line=${line.offset[i].toFixed(2)} wallL=${track.left.wall[i].toFixed(2)} wallR=${track.right.wall[i].toFixed(2)} edgeL=${track.left.edge[i].toFixed(2)} edgeR=${track.right.edge[i].toFixed(2)} steer=${inp.steer.toFixed(2)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} R=${(1 / Math.abs(track.curvature[i])).toFixed(0)} grade=${(track.grade[i] * 100).toFixed(1)}`);
    }
  }
});
