// Colour-only driver over several laps (tests/colour-driver-fixture.ts) with a trace around each wall impact:
// speed against the guidance, colour ratio, pedals, steering, error from the line, per-wheel use, load,
// temperature and grip. PROF=static drives the fixed new-tyre World profile instead of the live one.
// Usage: CIRCUIT=bathurst|adelaide CARS=camaro,mustang,supra LAPS=2 TEMP=95 COMPOUND=soft|hard START=100|grid \
//   PROF=session|static TRACE=1 npx vitest run --config vitest.debug.config.ts tests/debug/guidance-warm.test.ts --silent=false
import { it } from 'vitest';
import { circuitCarSpec, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { Autopilot } from '@/race/autopilot';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { brakeRatio, LINE_RED, LINE_YELLOW } from '@/world/racing-line-mesh';

it('colour-only driver on warm tyres', () => {
  const circuit = process.env.CIRCUIT ?? 'bathurst';
  const track = circuit === 'adelaide' ? createAdelaideTrack() : new Track();
  const line = computeRacingLine(track), kerbs = placeKerbs(track, line);
  const laps = Number(process.env.LAPS ?? 2), temp = Number(process.env.TEMP ?? 95);
  const start = process.env.START === 'grid' ? track.wrapS(track.gridLineS - 7) : Number(process.env.START ?? 100);
  for (const kind of (process.env.CARS ?? 'camaro,mustang,supra').split(',') as CarKind[]) {
    const spec = circuitCarSpec(kind, track.id);
    const v = new Vehicle(spec, track, kerbs);
    v.stint.reset({ tempC: temp, compound: (process.env.COMPOUND ?? 'soft') as 'soft' | 'hard' });
    v.reset(start, line.offset[Math.round(start / track.spacing) % track.n]);
    const profiles = new SessionProfiles(v, line);
    const staticProf = computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING), LINE_PROFILE);
    const prof = process.env.PROF === 'static' ? staticProf : profiles.player;
    const steer = new Autopilot(track, line, prof);
    const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
    let maxImpact = 0, impactAt = -1, worstOff = 0, offAt = -1, driven = 0, previous = v.tp.s, t = 0, after = -1;
    const ring: string[] = [];
    const lapTimes: number[] = [];
    let lapT = 0, profSum = 0, profN = 0, profMax = 0;
    for (let k = 0; k < 360 * 200 * laps && driven < laps * track.length; k++) {
      profiles.update();
      steer.drive(v, input);
      const s = v.tp.s, speed = Math.max(0, v.speed);
      let r = -Infinity, rAt = 0;
      for (let d = 6; d <= 30; d += track.spacing) {
        const q = brakeRatio(prof.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n], speed, d);
        if (q > r) { r = q; rAt = d; }
      }
      input.brake = r > LINE_RED ? 1 : 0;
      input.throttle = r > LINE_YELLOW ? 0 : 1;
      if (process.env.TRACE && k % 18 === 0) {
        const i = v.tp.index, j = (i + 1) % track.n;
        const lineD = line.offset[i] + (line.offset[j] - line.offset[i]) * v.tp.t;
        const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
        const beta = Math.atan2(v.vx * cs - v.vz * sn, Math.max(1, v.vx * sn + v.vz * cs)) * 57.3;
        const side = v.tp.d >= 0 ? track.left : track.right;
        ring.push(`lap${(driven / track.length).toFixed(2)} s=${s.toFixed(0)} v=${speed.toFixed(1)} tgt=${prof.speed[i].toFixed(1)} lim=${prof.cornerLimit[i].toFixed(1)} r=${r.toFixed(2)}@${rAt} thr=${input.throttle} brk=${input.brake} st=${input.steer.toFixed(2)} err=${(v.tp.d - lineD).toFixed(2)} d=${v.tp.d.toFixed(1)} edge=${(Math.abs(v.tp.d) - side.edge[i]).toFixed(2)} beta=${beta.toFixed(1)} k=${line.curvature[i].toFixed(4)} use=${v.wheels.map((w) => w.slip.toFixed(2)).join(',')} fz=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')} T=${v.stint.tyres.map((y) => y.tempC.toFixed(0)).join(',')} g=${v.stint.tyres.map((y) => y.grip.toFixed(3)).join(',')} gear=${v.pt.gear}`);
        if (ring.length > Number(process.env.RING ?? 160) && after < 0) ring.shift();
        if (after >= 0 && --after === 0) { console.log(ring.join('\n')); ring.length = 0; }
      }
      for (const im of v.step(input, 1 / 360)) {
        if (im.speed > maxImpact) { maxImpact = im.speed; impactAt = s; }
        if (im.speed > 1 && after < 0 && process.env.TRACE && ring.length > 0) after = 40;
      }
      t += 1 / 360;
      const side = v.tp.d >= 0 ? track.left : track.right;
      const off = Math.abs(v.tp.d) - side.edge[v.tp.index];
      if (off > worstOff) { worstOff = off; offAt = v.tp.s; }
      let ds = v.tp.s - previous;
      if (ds < -track.length / 2) ds += track.length;
      driven += Math.max(0, ds);
      previous = v.tp.s;
      if (driven >= (lapTimes.length + 1) * track.length) { lapTimes.push(t - lapT); lapT = t; }
      if (k % 360 === 0) { profSum += prof.lapTimeS; profN++; profMax = Math.max(profMax, prof.lapTimeS); }
    }
    console.log(`${circuit} ${kind} T${temp}: laps ${(driven / track.length).toFixed(2)} times ${lapTimes.map((x) => x.toFixed(1)).join(',')} impact ${maxImpact.toFixed(1)}@${impactAt.toFixed(0)} worstOff ${worstOff.toFixed(2)}@${offAt.toFixed(0)} profLap ${prof.lapTimeS.toFixed(1)} profAvg ${(profSum / profN).toFixed(2)} profMax ${profMax.toFixed(2)} staticLap ${staticProf.lapTimeS.toFixed(1)} tyres ${v.stint.tyres.map((y) => `${y.tempC.toFixed(0)}/${y.wear.toFixed(3)}/${y.grip.toFixed(3)}`).join(' ')}`);
  }
}, 600000);
