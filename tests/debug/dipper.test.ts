import { it } from 'vitest';
import { Track } from '@/track/track-model';
it('dipper heights', () => {
  const t = new Track();
  for (let s = 3560; s <= 3660; s += 4) {
    const i = Math.round(s / t.spacing);
    const g = (t.py[i + 1] - t.py[i - 1]) / (2 * t.spacing);
    const k = (t.py[i + 1] - 2 * t.py[i] + t.py[i - 1]) / (t.spacing ** 2);
    console.log(`s=${s} y=${t.py[i].toFixed(2)} grade=${g.toFixed(3)} vcurv=${k.toFixed(4)} bank=${t.bank[i].toFixed(3)} edgeL=${t.left.edge[i].toFixed(2)} wallL=${t.left.wall[i].toFixed(2)} edgeR=${t.right.edge[i].toFixed(2)} wallR=${t.right.wall[i].toFixed(2)} curv=${t.curvature[i].toFixed(4)}`);
  }
});
