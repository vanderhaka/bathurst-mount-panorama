// Exports the full-grip racing-line speed (m/s) every 4 m of lap distance for the track
// data pipeline (scripts/build-track-data.mjs uses it to size vertical curves).
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('export racing speed', () => {
  const t = new Track();
  const p = computeSpeedProfile(t, computeRacingLine(t), CAR_SPECS.mustang);
  const out: number[] = [];
  for (let k = 0; k < t.n; k++) out.push(Math.round(p.speed[k] * 10) / 10);
  writeFileSync('data/raw/speed-estimate.json', JSON.stringify({ note: 'Full-grip racing-line speed (m/s) per track sample, from tests/debug/export-speed.test.ts', spacingM: t.spacing, speed: out }));
});
