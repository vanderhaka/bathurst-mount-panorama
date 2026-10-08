import type { SideArrays } from '@/track/apply-layout';
import type { Corner } from '@/track/track-model';

/** Widths and runoff are conservative gameplay estimates, not a barrier survey. */
export function adelaideSides(n: number, spacing: number, length: number, corners: readonly Corner[]): { left: SideArrays; right: SideArrays; bank: Float32Array } {
  const side = (): SideArrays => ({ edge: new Float32Array(n), wall: new Float32Array(n),
    surface: new Array(n).fill('asphalt'), barrier: new Array(n).fill('concrete'), fence: new Uint8Array(n).fill(1) });
  const left = side(), right = side();
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), length - Math.abs(a - b));
  const blend = (s: number, centre: number, radius: number) => {
    const t = Math.max(0, 1 - distance(s, centre) / radius);
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < n; i++) {
    const s = i * spacing;
    const half = 6 + 0.8 * blend(s, 0, 220) - 1.4 * blend(s, 320, 145) - 0.5 * blend(s, 1848, 80);
    left.edge[i] = right.edge[i] = half;
    left.wall[i] = right.wall[i] = half + 1.65;
    for (const corner of corners) {
      const outside = corner.dir === 'L' ? right : left;
      outside.wall[i] += (corner.turn === 8 ? 1 : 6) * blend(s, corner.s, 38);
    }
  }
  return { left, right, bank: new Float32Array(n) };
}
