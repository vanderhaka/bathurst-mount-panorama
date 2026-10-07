// Small curve helpers for the body loft: 1D monotone cubic profiles (side and
// plan view curves along the car) and a 2D centripetal Catmull-Rom sampler for
// the cross-sections.

export type Knot = readonly [number, number];
export type Curve = (x: number) => number;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export function smoothstep(a: number, b: number, v: number): number {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Monotone cubic (Fritsch-Carlson) interpolation through knots sorted by x; clamped at the ends. */
export function makeCurve(knots: readonly Knot[]): Curve {
  const n = knots.length;
  if (n === 1) return () => knots[0][1];
  const xs = knots.map((k) => k[0]);
  const ys = knots.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

export interface P2 { x: number; y: number }

/**
 * Point on the centripetal Catmull-Rom segment p1 -> p2 (t in 0..1). p0/p3 are
 * the outer neighbours; pass a reflected point for a crease (no tangent bleed).
 */
export function catmullRom(p0: P2, p1: P2, p2: P2, p3: P2, t: number): P2 {
  const dist = (a: P2, b: P2) => Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)), 1e-4);
  const t0 = 0;
  const t1 = t0 + dist(p0, p1);
  const t2 = t1 + dist(p1, p2);
  const t3 = t2 + dist(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a: P2, b: P2, ta: number, tb: number): P2 => {
    const w = (u - ta) / (tb - ta);
    return { x: a.x + (b.x - a.x) * w, y: a.y + (b.y - a.y) * w };
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Reflects `b` through `a` (used as a virtual neighbour at creases and ends). */
export function reflect(a: P2, b: P2): P2 {
  return { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
}
