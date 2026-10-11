import type { Track } from '@/track/track-model';
import type { VergeSurface } from '@/track/layout';

/** Location of a point relative to the track. */
export interface TrackPoint {
  /** Sample index of the segment start. */
  index: number;
  /** 0..1 position along the segment [index, index+1]. */
  t: number;
  /** Distance along the centreline (m), 0..length. */
  s: number;
  /** Lateral offset from the centreline (m), + = left. */
  d: number;
}

export type SurfaceKind = 'road' | 'kerb' | VergeSurface;

export function createTrackPoint(): TrackPoint {
  return { index: 0, t: 0, s: 0, d: 0 };
}

/**
 * Projects a world x/z point onto the centreline. `hint` is the last known index
 * (local search, cheap); pass -1 for a global search.
 */
export function projectToTrack(track: Track, x: number, z: number, hint: number, out: TrackPoint): TrackPoint {
  const { px, pz } = track;
  let best = hint;
  if (hint < 0) {
    best = track.nearestIndex(x, z);
  } else {
    let bestD = Infinity;
    for (let k = -16; k <= 16; k++) {
      const i = track.wrap(hint + k);
      const d = (px[i] - x) ** 2 + (pz[i] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    if (bestD > 60 * 60) best = track.nearestIndex(x, z);
  }
  return projectOnSection(track, x, z, best, out);
}

/** Projects a world x/z point onto the section of centreline around sample `best` (no search). */
export function projectOnSection(track: Track, x: number, z: number, best: number, out: TrackPoint): TrackPoint {
  const { px, pz } = track;
  // Exact inverse of pointAt(): on segment [a, b] the frame is c(t) = A + t(B - A) with
  // normal n(t) = lerp(nA, nB, t). Solve cross(p - c(t), n(t)) = 0 for t (a quadratic).
  // This is continuous across samples, also on the inside of tight corners.
  let segI = -1, segT = 0, bestAbsD = Infinity;
  for (const a of [track.wrap(best - 1), best]) {
    const b = track.wrap(a + 1);
    const t = solveSegment(track, a, b, x, z);
    if (t === null) continue;
    const cx = px[a] + (px[b] - px[a]) * t, cz = pz[a] + (pz[b] - pz[a]) * t;
    let lx = track.lx[a] + (track.lx[b] - track.lx[a]) * t, lz = track.lz[a] + (track.lz[b] - track.lz[a]) * t;
    const ll = Math.hypot(lx, lz);
    lx /= ll; lz /= ll;
    const d = (x - cx) * lx + (z - cz) * lz;
    if (Math.abs(d) < bestAbsD) { bestAbsD = Math.abs(d); segI = a; segT = t; out.d = d; }
  }
  if (segI < 0) {
    // Fallback (point far outside the corridor): nearest point on the chord.
    segI = best;
    const b = track.wrap(best + 1);
    const ex = px[b] - px[best], ez = pz[b] - pz[best];
    segT = Math.min(1, Math.max(0, ((x - px[best]) * ex + (z - pz[best]) * ez) / (ex * ex + ez * ez)));
    const cx = px[best] + ex * segT, cz = pz[best] + ez * segT;
    out.d = (x - cx) * track.lx[best] + (z - cz) * track.lz[best];
  }
  out.index = segI;
  out.t = segT;
  out.s = (segI + segT) * track.spacing;
  return out;
}

function solveSegment(track: Track, a: number, b: number, x: number, z: number): number | null {
  const qx = x - track.px[a], qz = z - track.pz[a];
  const ex = track.px[b] - track.px[a], ez = track.pz[b] - track.pz[a];
  const nax = track.lx[a], naz = track.lz[a];
  const dnx = track.lx[b] - nax, dnz = track.lz[b] - naz;
  const cross = (ux: number, uz: number, vx: number, vz: number) => ux * vz - uz * vx;
  const A = -cross(ex, ez, dnx, dnz);
  const B = cross(qx, qz, dnx, dnz) - cross(ex, ez, nax, naz);
  const C = cross(qx, qz, nax, naz);
  const eps = 1e-6;
  const ok = (t: number) => t >= -eps && t <= 1 + eps;
  if (Math.abs(A) < 1e-9) {
    const t = -C / B;
    return ok(t) ? Math.min(1, Math.max(0, t)) : null;
  }
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const r = Math.sqrt(disc);
  const t1 = (-B + r) / (2 * A), t2 = (-B - r) / (2 * A);
  const pick = ok(t1) && ok(t2) ? (Math.abs(t1 - 0.5) < Math.abs(t2 - 0.5) ? t1 : t2) : ok(t1) ? t1 : ok(t2) ? t2 : null;
  return pick === null ? null : Math.min(1, Math.max(0, pick));
}

/** Two sections of road that are both locally nearest to a point (see foldAt). */
export interface Fold {
  /** Nearest sample, and the nearest sample of the other section. */
  near: number;
  rival: number;
  /** Depth (m) of each distance valley below the ridge between them: 0 as a section first becomes a rival. */
  nearDepth: number;
  rivalDepth: number;
}

const FOLD_DIST = new Float64Array(35);

/**
 * Past the centre of a tight bend (a wide gravel trap) two sections of road can be about equally near. Finds the
 * nearest sample and the nearest separate local minimum of distance within the local search window. Returns false
 * when there is no second section.
 */
export function foldAt(track: Track, x: number, z: number, hint: number, out: Fold): boolean {
  const { px, pz } = track;
  for (let k = -17; k <= 17; k++) { const i = track.wrap(hint + k); FOLD_DIST[k + 17] = Math.hypot(px[i] - x, pz[i] - z); }
  const dist = (k: number) => FOLD_DIST[k + 17];
  let near = 0, nearD = Infinity;
  for (let k = -16; k <= 16; k++) { const d = dist(k); if (d < nearD) { nearD = d; near = k; } }
  let rival = 0, rivalD = Infinity;
  for (let k = -16; k <= 16; k++) {
    if (k === near) continue;
    const d = dist(k);
    if (d < rivalD && d < dist(k - 1) && d < dist(k + 1)) { rivalD = d; rival = k; }
  }
  if (rivalD === Infinity) return false;
  let ridge = 0;
  for (let k = Math.min(near, rival); k <= Math.max(near, rival); k++) ridge = Math.max(ridge, dist(k));
  out.near = track.wrap(hint + near);
  out.rival = track.wrap(hint + rival);
  out.nearDepth = ridge - nearD;
  out.rivalDepth = ridge - rivalD;
  return true;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Interpolated value of a per-sample array at (index, t). */
export function sampleArray(track: Track, arr: ArrayLike<number>, index: number, t: number): number {
  return lerp(arr[index], arr[track.wrap(index + 1)], t);
}

/** Verge falls away from the road edge at this gradient (drainage). */
export const VERGE_FALL = 0.035;

/**
 * Surface height at (index, t, d). One function for physics and meshes so that
 * the car always sits on what is drawn.
 */
export function heightAt(track: Track, index: number, t: number, d: number): number {
  const yc = sampleArray(track, track.py, index, t);
  const bank = sampleArray(track, track.bank, index, t);
  const sideArr = d >= 0 ? track.left : track.right;
  const edge = sampleArray(track, sideArr.edge, index, t);
  const ad = Math.abs(d);
  if (ad <= edge) return yc + d * Math.tan(bank);
  const yEdge = yc + Math.sign(d) * edge * Math.tan(bank);
  return yEdge - (ad - edge) * VERGE_FALL;
}

/** World position of the point (s, d) on the surface. Writes into out [x, y, z]. */
export function pointAt(track: Track, s: number, d: number, out: [number, number, number]): [number, number, number] {
  const f = track.wrapS(s) / track.spacing;
  const i = Math.floor(f) % track.n;
  const t = f - Math.floor(f);
  const j = track.wrap(i + 1);
  let lx = lerp(track.lx[i], track.lx[j], t), lz = lerp(track.lz[i], track.lz[j], t);
  const ll = Math.hypot(lx, lz);
  lx /= ll; lz /= ll;
  out[0] = lerp(track.px[i], track.px[j], t) + lx * d;
  out[2] = lerp(track.pz[i], track.pz[j], t) + lz * d;
  out[1] = heightAt(track, i, t, d);
  return out;
}

/** Surface type at a lateral offset. Kerbs are read from the kerb width arrays. */
export function surfaceAt(track: Track, index: number, t: number, d: number, kerbL?: Float32Array, kerbR?: Float32Array): SurfaceKind {
  const left = d >= 0;
  const sideArr = left ? track.left : track.right;
  const edge = sampleArray(track, sideArr.edge, index, t);
  const ad = Math.abs(d);
  if (ad <= edge) return 'road';
  const kerbs = left ? kerbL : kerbR;
  if (kerbs) {
    const kw = sampleArray(track, kerbs, index, t);
    if (kw > 0.05 && ad <= edge + kw) return 'kerb';
  }
  return sideArr.surface[t < 0.5 ? index : track.wrap(index + 1)];
}
