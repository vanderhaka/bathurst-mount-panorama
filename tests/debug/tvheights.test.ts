import { it } from 'vitest';
import { Track } from '@/track/track-model';
import { tvCameraCount, tvCameraPoint, TV_SPACING } from '@/track/tv-cameras';
import { pointAt } from '@/track/track-query';
it('tv heights', () => {
  const t = new Track();
  const out: [number, number, number] = [0, 0, 0], g: [number, number, number] = [0, 0, 0];
  const r: string[] = [];
  for (let k = 0; k < tvCameraCount(t); k++) {
    tvCameraPoint(t, k, out);
    const s = k * TV_SPACING; const i = Math.floor(s / t.spacing); const side = k % 2 === 0 ? 1 : -1;
    pointAt(t, s, side * ((side > 0 ? t.left : t.right).wall[i] + 3), g);
    r.push(`${s}:${(out[1] - g[1]).toFixed(1)}`);
  }
  console.log(r.join(' '));
});
