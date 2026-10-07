import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
// The Chase: centreline and racing-line radius, ideal speed for the measured and the tuned car.
it('chase radius and speeds', () => {
  const t = new Track();
  const line = computeRacingLine(t);
  const measured = computeSpeedProfile(t, line, CAR_SPECS.camaro);
  const tuned = computeSpeedProfile(t, line, tunedSpec(CAR_SPECS.camaro, DEFAULT_HANDLING));
  for (let s = 5200; s <= 5800; s += 20) {
    const i = Math.round(s / t.spacing);
    console.log(`s=${s} Rc=${(1 / Math.abs(t.curvature[i])).toFixed(0).padStart(5)} Rline=${(1 / Math.abs(line.curvature[i])).toFixed(0).padStart(5)} off=${line.offset[i].toFixed(1).padStart(5)} w=${(t.left.edge[i] + t.right.edge[i]).toFixed(1)} vMeasured=${(measured.speed[i] * 3.6).toFixed(0).padStart(3)} vTuned=${(tuned.speed[i] * 3.6).toFixed(0).padStart(3)}`);
  }
  let minM = Infinity, minT = Infinity, minR = Infinity;
  for (let s = 5500; s <= 5720; s += 2) {
    const i = Math.round(s / t.spacing);
    minM = Math.min(minM, measured.speed[i] * 3.6); minT = Math.min(minT, tuned.speed[i] * 3.6); minR = Math.min(minR, 1 / Math.abs(line.curvature[i]));
  }
  console.log(`Chase L-R minimum: measured ${minM.toFixed(0)} km/h, tuned ${minT.toFixed(0)} km/h, tightest line radius ${minR.toFixed(0)} m; track length ${t.length.toFixed(1)} m`);
});
