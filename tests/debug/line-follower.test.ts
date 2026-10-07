import { it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';

it('line-colour follower sweep', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const grips = (process.env.GRIPS ?? '0.92').split(',').map(Number);
  const tbe = Number(process.env.TBE ?? 2);
  for (const kind of ['camaro', 'mustang'] as CarKind[]) for (const g of grips) {
    const spec = CAR_SPECS[kind];
    const prof = computeSpeedProfile(track, line, spec, { gripFactor: g, trailBrakeExp: tbe });
    const v = new Vehicle(spec, track, kerbs);
    const ap = new Autopilot(track, line, prof);
    v.reset(100, line.offset[Math.round(100 / track.spacing)]);
    const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
    let maxImpact = 0, impactAt = -1, offT = 0, worstOff = 0, offAt = -1, t = 0;
    for (let k = 0; k < 360 * 160; k++) {
      ap.drive(v, inp); // steering only
      const s = v.tp.s, sp = Math.max(0, v.speed);
      let r = -Infinity;
      for (let dd = 6; dd <= 30; dd += track.spacing) r = Math.max(r, brakeRatio(prof.speed[Math.floor(track.wrapS(s + dd) / track.spacing) % track.n], sp, dd));
      if (r > LINE_RED) { inp.brake = 1; inp.throttle = 0; } else if (r > LINE_YELLOW) { inp.brake = 0; inp.throttle = 0; } else { inp.brake = 0; inp.throttle = 1; }
      for (const im of v.step(inp, 1 / 360)) if (im.speed > maxImpact) { maxImpact = im.speed; impactAt = s; }
      t += 1 / 360;
      if (process.env.TRACE && kind === 'camaro' && g === grips[0] && s > Number(process.env.T0 ?? 300) && s < Number(process.env.T1 ?? 560) && k % 18 === 0) {
        const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
        const beta = Math.atan2(v.vx * cs - v.vz * sn, Math.max(1, v.vx * sn + v.vz * cs)) * 57.3;
        console.log(`TR s=${s.toFixed(0)} v=${(sp * 3.6).toFixed(0)} tgt=${(prof.speed[v.tp.index] * 3.6).toFixed(0)} r=${r.toFixed(2)} thr=${inp.throttle} brk=${inp.brake} d=${v.tp.d.toFixed(1)} line=${line.offset[v.tp.index].toFixed(1)} beta=${beta.toFixed(1)} slips=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')} gear=${v.pt.gear}`);
      }
      const side = v.tp.d >= 0 ? track.left : track.right;
      const off = Math.abs(v.tp.d) - side.edge[v.tp.index];
      if (off > 0.5) offT += 1 / 360;
      if (off > worstOff) { worstOff = off; offAt = s; }
    }
    console.log(`${kind} g=${g} tbe=${tbe}: impact ${maxImpact.toFixed(1)}@${impactAt.toFixed(0)} worstOff ${worstOff.toFixed(2)}@${offAt.toFixed(0)} offTime ${offT.toFixed(1)}s profLap ${prof.lapTimeS.toFixed(1)}`);
  }
});
