// Line-profile corner speeds and lap time for a given tyre state: the four-tyre mean (as before the
// per-tyre wheelGrip) against the weaker axle per turn direction.
// Usage: CIRCUIT=bathurst GRIPS=0.927,0.877,0.992,0.969 AT=3990 npx vitest run --config vitest.debug.config.ts tests/debug/guidance-grip.test.ts --silent=false
import { it } from 'vitest';
import { circuitCarSpec, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { stintSpec } from '@/physics/stint-spec';
import { Vehicle } from '@/physics/vehicle';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

it('line profile for a tyre state', () => {
  const track = process.env.CIRCUIT === 'adelaide' ? createAdelaideTrack() : new Track();
  const line = computeRacingLine(track), kerbs = placeKerbs(track, line);
  const grips = (process.env.GRIPS ?? '1,1,1,1').split(',').map(Number);
  const at = (process.env.AT ?? '3990').split(',').map(Number);
  const v = new Vehicle(circuitCarSpec((process.env.CAR ?? 'camaro') as CarKind, track.id), track, kerbs);
  v.stint.reset({ tempC: 95 });
  grips.forEach((g, w) => { v.stint.tyres[w].grip = g; });
  const tuned = tunedSpec(v.spec, DEFAULT_HANDLING), spec = stintSpec(tuned, v.stint);
  const mean = computeSpeedProfile(track, line, { ...spec, wheelGrip: tuned.wheelGrip }, LINE_PROFILE);
  const weak = computeSpeedProfile(track, line, spec, LINE_PROFILE);
  const fresh = computeSpeedProfile(track, line, tuned, LINE_PROFILE);
  const min = (p: typeof mean, s: number) => {
    let m = Infinity;
    for (let d = -40; d <= 40; d += track.spacing) m = Math.min(m, p.speed[Math.floor(track.wrapS(s + d) / track.spacing) % track.n]);
    return m.toFixed(2);
  };
  console.log(`grips ${grips.join(',')} lap: fresh ${fresh.lapTimeS.toFixed(2)} mean ${mean.lapTimeS.toFixed(2)} weak ${weak.lapTimeS.toFixed(2)}`);
  for (const s of at) console.log(`  min near ${s}: fresh ${min(fresh, s)} mean ${min(mean, s)} weak ${min(weak, s)}`);
});
