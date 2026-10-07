import { it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Autopilot } from '@/race/autopilot';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { placeKerbs } from '@/track/kerbs';

const DT = 1 / 360;
it('ai grip sweep', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const grips = (process.env.GRIPS ?? '0.86,0.9,0.93').split(',').map(Number);
  for (const kind of ['camaro', 'mustang'] as CarKind[]) for (const g of grips) {
    const spec = CAR_SPECS[kind];
    const aiProfile = computeSpeedProfile(track, line, spec, { gripFactor: g, trailBrakeExp: Number(process.env.TBE ?? 2) });
    const v = new Vehicle(spec, track, kerbs);
    const ap = new Autopilot(track, line, aiProfile);
    const s0 = track.wrapS(track.startLineS - 300);
    v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
    const inp = { steer: 0, throttle: 0, brake: 0, handbrake: false, shiftUp: false, shiftDown: false } as any;
    let t = 0, crossings = 0, lapStart = 0, lapTime = 0, maxImpact = 0, impactAt = -1;
    let prevS = v.tp.s; let maxOff = 0, offAt = 0;
    const minAt: Record<string, number> = {};
    while (t < 400 && crossings < 3) {
      ap.drive(v, inp);
      const impacts = v.step(inp, DT);
      for (const im of impacts) if (im.speed > maxImpact) { maxImpact = im.speed; impactAt = v.tp.s; }
      t += DT;
      const s = v.tp.s;
      if (crossings === 1) {
        for (const [name, a, b] of [['Hell', 300, 520], ['Griffins', 1450, 1650], ['Cutting', 1900, 2100], ['Dipper', 3600, 3800], ['Elbow', 3950, 4150], ['Chase', 5350, 5700], ['Murrays', 6000, 6150]] as const) {
          if (s > a && s < b) minAt[name] = Math.min(minAt[name] ?? 999, v.speed * 3.6);
        }
        const side = v.tp.d >= 0 ? track.left : track.right;
        const off = Math.abs(v.tp.d) - side.edge[v.tp.index];
        if (off > maxOff) { maxOff = off; offAt = s; }
      }
      const crossed = prevS < track.startLineS && s >= track.startLineS && s - prevS < 50;
      if (crossed) { crossings++; if (crossings === 2) lapTime = t - lapStart; lapStart = t; }
      prevS = s;
    }
    console.log(`${kind} g=${g}: lap ${lapTime.toFixed(2)} prof ${aiProfile.lapTimeS.toFixed(2)} impact ${maxImpact.toFixed(1)}@${impactAt.toFixed(0)} maxOff ${maxOff.toFixed(2)}@${offAt.toFixed(0)} mins ${Object.entries(minAt).map(([k, x]) => `${k}:${x.toFixed(0)}`).join(' ')}`);
  }
});
