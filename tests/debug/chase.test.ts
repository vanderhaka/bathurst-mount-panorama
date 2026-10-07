import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
it('chase line', () => {
  const t = new Track();
  const line = computeRacingLine(t);
  const p = computeSpeedProfile(t, line, CAR_SPECS.camaro);
  for (let s = 5280; s <= 5760; s += 16) {
    const i = Math.round(s / t.spacing);
    console.log(`s=${s} off=${line.offset[i].toFixed(2)} edgeL=${t.left.edge[i].toFixed(1)} edgeR=${t.right.edge[i].toFixed(1)} wallL=${t.left.wall[i].toFixed(1)} wallR=${t.right.wall[i].toFixed(1)} Rline=${(1 / Math.abs(line.curvature[i])).toFixed(0)} Rc=${(1 / Math.abs(t.curvature[i])).toFixed(0)} v=${(p.speed[i] * 3.6).toFixed(0)} lim=${(p.cornerLimit[i] * 3.6).toFixed(0)}`);
  }
});
