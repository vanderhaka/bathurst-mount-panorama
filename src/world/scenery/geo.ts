import type { Track } from '@/track/track-model';

export type XZ = [number, number];

export function pointInPolygon(x: number, z: number, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(poly: XZ[]): number {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

export function centroid(poly: XZ[]): XZ {
  let x = 0, z = 0;
  for (const p of poly) { x += p[0]; z += p[1]; }
  return [x / poly.length, z / poly.length];
}

/** Minimum-area oriented bounding box: centre, length (along angle), width, angle (rad, from +X). */
export function orientedBox(poly: XZ[]): { cx: number; cz: number; length: number; width: number; angle: number } {
  let best = { cx: 0, cz: 0, length: 0, width: 0, angle: 0 }, bestArea = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const ang = Math.atan2(poly[i + 1][1] - poly[i][1], poly[i + 1][0] - poly[i][0]);
    const c = Math.cos(ang), s = Math.sin(ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of poly) {
      const u = x * c + z * s, v = -x * s + z * c;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const u = (minU + maxU) / 2, v = (minV + maxV) / 2;
      best = { cx: u * c - v * s, cz: u * s + v * c, length: maxU - minU, width: maxV - minV, angle: ang };
    }
  }
  if (best.width > best.length) best = { ...best, length: best.width, width: best.length, angle: best.angle + Math.PI / 2 };
  return best;
}

/** Yaw (rotation about +Y, three.js convention) that makes an object's +Z face the nearest track point. */
export function yawFacingTrack(track: Track, x: number, z: number): number {
  const i = track.nearestIndex(x, z);
  return Math.atan2(track.px[i] - x, track.pz[i] - z);
}

/** Deterministic pseudo-random generator. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Simple uniform grid over items for "is anything near this point" queries. */
export class SpatialMask {
  private readonly cells = new Map<number, Array<[number, number, number]>>();
  constructor(private readonly cell = 20) {}
  add(x: number, z: number, radius: number): void {
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
      const k = i * 73856093 ^ j * 19349663;
      const list = this.cells.get(k);
      if (list) list.push([x, z, radius]);
      else this.cells.set(k, [[x, z, radius]]);
    }
  }
  blocked(x: number, z: number, pad = 0): boolean {
    const k = Math.floor(x / this.cell) * 73856093 ^ Math.floor(z / this.cell) * 19349663;
    const list = this.cells.get(k);
    if (!list) return false;
    for (const [px, pz, r] of list) if ((px - x) ** 2 + (pz - z) ** 2 < (r + pad) ** 2) return true;
    return false;
  }
}
