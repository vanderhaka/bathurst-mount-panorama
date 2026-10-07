import type { Track } from '@/track/track-model';

export interface RacingLine {
  /** Lateral offset of the line from the centreline per sample (m, + = left). */
  offset: Float32Array;
  /** World positions of the line per sample. */
  x: Float32Array;
  z: Float32Array;
  /** Signed horizontal curvature of the line (1/m, + = left). */
  curvature: Float32Array;
  /** Distance increment between successive line samples (m). */
  ds: Float32Array;
}

export interface RacingLineOptions {
  /** Distance kept between the car centre and the road edge (m). */
  margin: number;
  /** Extra distance the line may use over the edge at apexes (kerbs), m. */
  kerbAllowance: number;
  iterations: number;
  /** Number of curvature-peak re-weighting passes (0 = plain minimum curvature). */
  peakPasses: number;
}

const DEFAULTS: RacingLineOptions = { margin: 1.25, kerbAllowance: 0.6, iterations: 1500, peakPasses: 3 };

/**
 * Minimum-curvature racing line. Minimises the sum of squared second
 * differences of the line points, subject to the road edges, with Gauss-Seidel
 * sweeps on a coarse-to-fine hierarchy (coarse levels move long straights fast).
 */
export function computeRacingLine(track: Track, opts: Partial<RacingLineOptions> = {}): RacingLine {
  const o = { ...DEFAULTS, ...opts };
  const n = track.n;
  const lo = new Float32Array(n);
  const hi = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const turn = Math.min(1, Math.abs(track.curvature[i]) * 60); // 0 on straights, 1 in corners
    const m = o.margin - o.kerbAllowance * turn;
    // Keep the car body (half width ~1 m) clear of the barriers as well as near the road edge.
    hi[i] = Math.min(track.left.edge[i] - m, track.left.wall[i] - 1.8);
    lo[i] = -Math.min(track.right.edge[i] - m, track.right.wall[i] - 1.8);
  }
  const offset = new Float32Array(n);
  const weights = new Float32Array(n).fill(1);
  for (const stride of [16, 8, 4, 2, 1]) {
    const iters = Math.round(o.iterations / Math.sqrt(stride * 2));
    relax(track, offset, lo, hi, stride, iters, weights);
    if (stride > 1) fillBetween(offset, stride, n);
  }
  // Re-weighted passes: penalise curvature peaks so slow corners use the width
  // like a real driver (larger apex radius) instead of one sharp kink.
  for (let pass = 0; pass < o.peakPasses; pass++) {
    const k = buildLine(track, offset).curvature;
    for (let i = 0; i < n; i++) weights[i] = 1 + (Math.abs(k[i]) * 50) ** 2;
    relax(track, offset, lo, hi, 1, Math.round(o.iterations * 0.6), weights);
  }
  return buildLine(track, offset);
}

function relax(track: Track, a: Float32Array, lo: Float32Array, hi: Float32Array, stride: number, iters: number, w: Float32Array): void {
  const { px, pz, lx, lz } = track;
  const n = track.n;
  const m = Math.floor(n / stride);
  const idx = (k: number) => (((k % m) + m) % m) * stride;
  const P = (k: number, out: number[]) => {
    const i = idx(k);
    out[0] = px[i] + lx[i] * a[i];
    out[1] = pz[i] + lz[i] * a[i];
  };
  const pm2 = [0, 0], pm1 = [0, 0], pp1 = [0, 0], pp2 = [0, 0];
  for (let it = 0; it < iters; it++) {
    for (let k = 0; k < m; k++) {
      const i = idx(k);
      P(k - 2, pm2); P(k - 1, pm1); P(k + 1, pp1); P(k + 2, pp2);
      // With a_i = 0, the point is the centre C_i.
      const cx = px[i], cz = pz[i];
      // Residuals of the three second differences that contain P_i (coefficients 1, -2, 1).
      const r1x = pm2[0] - 2 * pm1[0] + cx, r1z = pm2[1] - 2 * pm1[1] + cz;
      const r2x = pm1[0] - 2 * cx + pp1[0], r2z = pm1[1] - 2 * cz + pp1[1];
      const r3x = cx - 2 * pp1[0] + pp2[0], r3z = cz - 2 * pp1[1] + pp2[1];
      const Lx = lx[i], Lz = lz[i];
      // Weighted residuals (weights of the second differences centred at k-1, k, k+1).
      const w1 = w[idx(k - 1)], w2 = w[i], w3 = w[idx(k + 1)];
      const num = (r1x * Lx + r1z * Lz) * w1 + (r2x * Lx + r2z * Lz) * -2 * w2 + (r3x * Lx + r3z * Lz) * w3;
      let v = -num / (w1 + 4 * w2 + w3);
      if (v > hi[i]) v = hi[i];
      if (v < lo[i]) v = lo[i];
      a[i] = v;
    }
  }
}

function fillBetween(a: Float32Array, stride: number, n: number): void {
  const m = Math.floor(n / stride);
  for (let k = 0; k < m; k++) {
    const i0 = k * stride;
    const i1 = ((k + 1) % m) * stride;
    const end = k === m - 1 ? n : i0 + stride;
    for (let i = i0 + 1; i < end; i++) {
      const t = (i - i0) / (end - i0);
      a[i] = a[i0] + (a[i1] - a[i0]) * t;
    }
  }
}

function buildLine(track: Track, offset: Float32Array): RacingLine {
  const n = track.n;
  const x = new Float32Array(n), z = new Float32Array(n), ds = new Float32Array(n), curvature = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = track.px[i] + track.lx[i] * offset[i];
    z[i] = track.pz[i] + track.lz[i] * offset[i];
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ds[i] = Math.hypot(x[j] - x[i], track.py[j] - track.py[i], z[j] - z[i]);
  }
  const raw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 2 + n) % n, b = (i + 2) % n;
    // Menger curvature through three points (signed, + = left).
    const ax = x[a], az = z[a], bx = x[i], bz = z[i], cx = x[b], cz = z[b];
    const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
    const d1 = Math.hypot(bx - ax, bz - az), d2 = Math.hypot(cx - bx, cz - bz), d3 = Math.hypot(cx - ax, cz - az);
    // In this frame (x east, z south) a negative cross product is a left turn.
    raw[i] = (-2 * cross) / (d1 * d2 * d3);
  }
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -2; k <= 2; k++) acc += raw[(i + k + n) % n];
    curvature[i] = acc / 5;
  }
  return { offset, x, z, curvature, ds };
}
