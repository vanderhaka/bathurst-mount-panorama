import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('griffins', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const spec = CAR_SPECS.camaro;
  const profile = computeSpeedProfile(track, line, spec);
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, profile);
  const s0 = 1300;
  v.reset(s0, line.offset[Math.round(s0 / track.spacing)]);
  // pre-roll at profile speed
  const sp = profile.speed[Math.round(s0 / track.spacing)];
  v.vx = Math.sin(v.heading) * sp; v.vz = Math.cos(v.heading) * sp;
  v.vy = sp * track.grade[Math.round(s0 / track.spacing)];
  v.pt.gear = 4;
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  const DT = 1 / 360;
  for (let k = 0; k < 360 * 8; k++) {
    ap.drive(v, inp);
    const imp = v.step(inp, DT);
    if (k % 36 === 0 || imp.length) {
      const i = Math.round(v.tp.s / track.spacing) % track.n;
      const vv = v as unknown as { comps: number[] };
      console.log(`s=${v.tp.s.toFixed(0)} d=${v.tp.d.toFixed(1)}/${line.offset[i].toFixed(1)} v=${(v.speed * 3.6).toFixed(0)}/${(profile.speed[i] * 3.6).toFixed(0)} g=${v.pt.gear} thr=${inp.throttle.toFixed(1)} brk=${inp.brake.toFixed(1)} st=${inp.steer.toFixed(2)} vy=${v.vy.toFixed(2)} grade=${track.grade[i].toFixed(3)} pitch=${v.pitch.toFixed(3)} roll=${v.roll.toFixed(3)} comps=${vv.comps.map((c) => c.toFixed(3)).join(',')} load=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')} gLat=${v.telemetry.gLat.toFixed(2)} gLong=${v.telemetry.gLong.toFixed(2)} surf=${v.wheels.map((w) => w.surface[0]).join('')}${imp.length ? ' IMPACT' : ''}`);
      if (imp.length && imp[0].speed > 6) break;
    }
  }
});
