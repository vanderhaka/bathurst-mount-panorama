import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
it('conrod profile', () => {
  const t = new Track();
  const line = computeRacingLine(t);
  const p = computeSpeedProfile(t, line, CAR_SPECS.camaro, LINE_PROFILE);
  const out: string[] = [];
  for (let s = 4100; s < 5700; s += 40) { const i = Math.floor(s / t.spacing); out.push(`${s}:${(p.speed[i] * 3.6).toFixed(0)}/${(p.cornerLimit[i] * 3.6).toFixed(0)}`); }
  console.log(out.join(' '));
});
