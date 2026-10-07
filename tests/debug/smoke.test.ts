import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('where does the AI smoke', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const spec = CAR_SPECS.camaro;
  const v = new Vehicle(spec, track, kerbs);
  const ap = new Autopilot(track, line, computeSpeedProfile(track, line, spec, AI_PROFILE));
  v.reset(100, line.offset[Math.round(100 / track.spacing)]);
  const inp = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  const bins = new Map<number, { n: number; max: number; thr: number; brk: number; front: number; rear: number }>();
  let total = 0, smoky = 0;
  for (let k = 0; k < 360 * 150; k++) {
    ap.drive(v, inp);
    v.step(inp, 1 / 360);
    if (k < 360 * 20) continue;
    total++;
    const slips = v.wheels.map((w) => (w.surface === 'road' || w.surface === 'kerb') ? w.slip : 0);
    const m = Math.max(...slips);
    if (m > 1.35) {
      smoky++;
      const b = Math.floor(v.tp.s / 50) * 50;
      const e = bins.get(b) ?? { n: 0, max: 0, thr: 0, brk: 0, front: 0, rear: 0 };
      e.n++; e.max = Math.max(e.max, m); e.thr += inp.throttle; e.brk += inp.brake;
      if (Math.max(slips[0], slips[1]) > 1.35) e.front++; else e.rear++;
      bins.set(b, e);
    }
  }
  console.log(`smoky fraction ${(smoky / total * 100).toFixed(1)}%`);
  for (const [b, e] of [...bins.entries()].sort((a, c) => a[0] - c[0])) console.log(`s=${b} t=${(e.n / 360).toFixed(2)}s max=${e.max.toFixed(2)} thr=${(e.thr / e.n).toFixed(2)} brk=${(e.brk / e.n).toFixed(2)} front=${e.front} rear=${e.rear}`);
});
