import { it } from 'vitest';
import { Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';
import { demHeight } from '@/world/dem';
it('cutting depth', () => {
  const t = new Track();
  for (let s = 1700; s <= 2320; s += 20) {
    const i = Math.round(s / t.spacing);
    const row: string[] = [];
    for (const side of [1, -1]) {
      const wall = (side > 0 ? t.left : t.right).wall[i];
      const road = heightAt(t, i, 0, side * wall);
      const out = [12, 20, 30].map((k) => {
        const d = side * (wall + k);
        const x = t.px[i] + -t.tz[i] * 0 + t.tz[i] * d * 0 + (t.tz[i]) * d, z = t.pz[i] - t.tx[i] * d;
        return (demHeight(x, z) - road).toFixed(1);
      });
      row.push(`${side > 0 ? 'L' : 'R'} wall=${wall.toFixed(1)} dem-road@+12/20/30=${out.join('/')}`);
    }
    console.log(`s=${s} ${row.join(' | ')}`);
  }
});
