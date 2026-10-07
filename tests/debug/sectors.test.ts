import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
it('sector split', () => {
  const t = new Track();
  const line = computeRacingLine(t);
  const p = computeSpeedProfile(t, line, CAR_SPECS.camaro);
  const i0 = Math.round(t.startLineS / t.spacing);
  let time = 0; const cum: number[] = [];
  for (let k = 0; k < t.n; k++) { const i = (i0 + k) % t.n, j = (i + 1) % t.n; cum.push(time); time += line.ds[i] / ((p.speed[i] + p.speed[j]) / 2); }
  const at = (f: number) => { const k = cum.findIndex((c) => c >= f * time); return t.wrapS((i0 + k) * t.spacing); };
  console.log('lap', time.toFixed(2), 'S1 end (41%) s=', at(0.41).toFixed(0), 'S2 end (68%) s=', at(0.68).toFixed(0));
  for (const s of [2200, 2550, 4010]) { const k = (Math.round(s / t.spacing) - i0 + t.n) % t.n; console.log(s, (cum[k] / time * 100).toFixed(1) + '%'); }
});
