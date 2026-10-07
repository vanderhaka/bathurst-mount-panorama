import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
it('profile laps', () => {
  const t = new Track();
  const line = computeRacingLine(t);
  for (const k of ['camaro', 'mustang'] as const) console.log(`${k} ideal ${computeSpeedProfile(t, line, CAR_SPECS[k]).lapTimeS.toFixed(2)}`);
});
