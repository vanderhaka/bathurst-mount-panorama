// 2D helpers for the lamp outlines: the emissive core of a lamp is the outline
// shrunk about its centroid (a projector inside its housing, or the LED strip
// down the middle of a tail bar).
import type { Outline } from '@/car/models/profile-types';

function centroid(o: Outline): [number, number] {
  let a = 0, b = 0;
  for (const [x, y] of o) { a += x; b += y; }
  return [a / o.length, b / o.length];
}

/** Outline scaled by (kx, ky) about its centroid. */
export function scaleAbout(o: Outline, kx: number, ky: number): Outline {
  const [cx, cy] = centroid(o);
  return o.map(([x, y]) => [cx + (x - cx) * kx, cy + (y - cy) * ky] as const);
}

/** Uniformly inset outline (projector lens inside a housing). */
export const inset = (o: Outline, k: number): Outline => scaleAbout(o, k, k);

/**
 * LED strip down the middle of a lamp bar: the shorter axis of the bar's box
 * shrinks to `fill` of its size, the longer one keeps almost all of it.
 */
export function ledCore(o: Outline, fill = 0.5): Outline {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of o) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const wide = x1 - x0 >= y1 - y0;
  return scaleAbout(o, wide ? 0.95 : fill, wide ? fill : 0.95);
}
