import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('trace', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const spec = CAR_SPECS[(process.env.CAR as 'camaro') ?? 'camaro'];
  const profile = computeSpeedProfile(track, line, spec);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, profile);
  const s0 = Number(process.env.S0 ?? 0);
  v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  const DT = 1 / 360;
  const T = Number(process.env.T ?? 30);
  for (let k = 0; k < T * 360; k++) {
    ap.drive(v, inp);
    const imp = v.step(inp, DT);
    const fine = process.env.FINE && k * DT > Number(process.env.FINE) && k * DT < Number(process.env.FINE) + 0.8;
    if (fine && k % 6 === 0) {
      const vv = v as unknown as { comps: number[] };
      console.log(`F t=${(k * DT).toFixed(3)} s=${v.tp.s.toFixed(1)} d=${v.tp.d.toFixed(2)} y=${v.y.toFixed(3)} vy=${v.vy.toFixed(2)} pitch=${v.pitch.toFixed(3)} roll=${v.roll.toFixed(3)} rr=${v.rollRate.toFixed(2)} comps=${vv.comps.map((c) => c.toFixed(3)).join(',')} load=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')} surf=${v.wheels.map((w) => w.surface[0]).join('')} gLat=${v.telemetry.gLat.toFixed(2)}`);
    }
    if (k % 90 === 0 || imp.length) {
      const i = Math.round(v.tp.s / track.spacing) % track.n;
      console.log(`t=${(k * DT).toFixed(2)} s=${v.tp.s.toFixed(0)} d=${v.tp.d.toFixed(2)} line=${line.offset[i].toFixed(2)} v=${(v.speed * 3.6).toFixed(0)} tgt=${(profile.speed[i] * 3.6).toFixed(0)} g=${v.pt.gear} rpm=${v.pt.rpm.toFixed(0)} thr=${inp.throttle.toFixed(2)} brk=${inp.brake.toFixed(2)} st=${inp.steer.toFixed(2)} yaw=${v.yawRate.toFixed(2)} slip=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')} load=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')}${imp.length ? ' IMPACT ' + imp[0].speed.toFixed(1) : ''}`);
      if (imp.length && imp[0].speed > 8) break;
    }
  }
});
