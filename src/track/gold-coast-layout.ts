import type { SideArrays } from '@/track/apply-layout';
import type { Corner } from '@/track/track-model';

/** Widths and runoff are conservative gameplay estimates, not a barrier survey. */
export function goldCoastSides(n: number, spacing: number, length: number, corners: readonly Corner[]): { left: SideArrays; right: SideArrays; bank: Float32Array } {
  const side = (): SideArrays => ({ edge: new Float32Array(n), wall: new Float32Array(n),
    surface: new Array(n).fill('asphalt'), barrier: new Array(n).fill('concrete'), fence: new Uint8Array(n).fill(1) });
  const left = side(), right = side();
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), length - Math.abs(a - b));
  const blend = (s: number, centre: number, radius: number) => {
    const t = Math.max(0, 1 - distance(s, centre) / radius);
    return t * t * (3 - 2 * t);
  };
  const runoff = (turn: number) => (turn === 4 || turn === 14 ? 4 : [1, 11, 12, 13, 15].includes(turn) ? 2.5 : 1);
  for (let i = 0; i < n; i++) {
    const s = i * spacing;
    const half = 6 + 1.0 * blend(s, 0, 380) - 0.6 * blend(s, 556, 90) - 0.7 * blend(s, 1482, 110);
    left.edge[i] = right.edge[i] = half;
    left.wall[i] = right.wall[i] = half + 1.2;
    for (const corner of corners) {
      const outside = corner.dir === 'L' ? right : left;
      outside.wall[i] += runoff(corner.turn) * blend(s, corner.s, 30);
    }
  }
  // G:link light rail runs beside the run into the Pizza Hut Hairpin (T4); the run was narrowed in 2013. Cap = nearest rail - 0.65 m,
  // measured every 5 m (minimum over +-5 m) from the OSM tram ways in gold-coast-trackside.json against this centreline.
  const caps = [10.53, 9.41, 8.81, 8.37, 7.51, 6.87, 6.59, 6.37, 6.33, 6.33, 6.53, 6.67, 6.83, 6.47, 6.11, 5.93, 5.91, 5.91, 5.91, 5.91, 5.91, 5.91, 6.17, 6.87, 8.11, 9.97, 23.97];
  const tramCap = (s: number) => {
    if (s < 640 || s >= 770) return Infinity;
    const f = (s - 640) / 5, k = Math.floor(f);
    return caps[k] + (caps[k + 1] - caps[k]) * (f - k);
  };
  for (let i = 0; i < n; i++) {
    const cap = tramCap(i * spacing);
    if (cap === Infinity) continue;
    right.wall[i] = Math.min(right.wall[i], cap);
    right.edge[i] = Math.max(4.9, Math.min(right.edge[i], right.wall[i] - 1.0));
  }
  // Qld photos: the real right edge of the pit straight is 4.0-5.0 m off this line; the grass median with the stands lies beyond.
  const ramp = (v: number) => { const u = Math.max(0, Math.min(1, v)); return u * u * (3 - 2 * u); };
  for (let i = 0; i < n; i++) {
    const s = i * spacing, w = s >= 2640 || s <= 360 ? 1 : s > 2600 ? ramp((s - 2600) / 40) : s < 400 ? ramp((400 - s) / 40) : 0;
    if (w <= 0 || right.edge[i] <= 4.9) continue;
    right.edge[i] -= (right.edge[i] - 4.9) * w; right.wall[i] = right.edge[i] + 1.2;
  }
  return { left, right, bank: new Float32Array(n) };
}
