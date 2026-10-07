import { it } from 'vitest';
import { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, pointAt, projectToTrack } from '@/track/track-query';
it('projection continuity', () => {
  const t = new Track();
  const tp = createTrackPoint();
  const p: [number, number, number] = [0, 0, 0];
  let prev = NaN, hint = Math.round(3600 / t.spacing), worst = 0, at = 0;
  for (let s = 3600; s < 3625; s += 0.05) {
    for (const d of [-2.5, 0, 1.8, 3.5]) {
      pointAt(t, s, d, p);
      projectToTrack(t, p[0], p[2], hint, tp);
      const h = heightAt(t, tp.index, tp.t, tp.d);
      const err = Math.abs(h - p[1]);
      if (err > worst) { worst = err; at = s; }
      if (d === 1.8) { if (Math.abs(h - prev) > 0.03) console.log(`jump at s=${s.toFixed(2)} d=${d}: ${prev.toFixed(3)} -> ${h.toFixed(3)} (proj s=${tp.s.toFixed(2)} d=${tp.d.toFixed(2)} idx=${tp.index} t=${tp.t.toFixed(2)})`); prev = h; }
    }
    hint = tp.index;
  }
  console.log('worst height mismatch', worst.toFixed(3), 'at', at.toFixed(2));
});
