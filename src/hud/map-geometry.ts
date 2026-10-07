// Pure track-map geometry: best-fit rotation, world -> map projection, corner lookup.
import type { HudTrackInfo } from '@/types/hud';

export interface MapTransform {
  cos: number;
  sin: number;
  /** World centre of the rotated bounding box. */
  cx: number;
  cy: number;
  scale: number;
  /** Map-space centre (px). */
  ox: number;
  oy: number;
}

type Outline = ReadonlyArray<readonly [number, number]>;

function rotatedBounds(outline: Outline, cos: number, sin: number): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, z] of outline) {
    const rx = x * cos - z * sin;
    const ry = x * sin + z * cos;
    if (rx < minX) minX = rx;
    if (rx > maxX) maxX = rx;
    if (ry < minY) minY = ry;
    if (ry > maxY) maxY = ry;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Rotation (radians, 0..PI) that makes the outline fill a box of the given
 * aspect (width / height) best. Screen x = world x, screen y = world z at 0
 * (north up, since z = -north).
 */
export function bestFitRotation(outline: Outline, aspect: number): number {
  let best = 0;
  let bestScale = -1;
  for (let deg = 0; deg < 180; deg++) {
    const a = (deg * Math.PI) / 180;
    const b = rotatedBounds(outline, Math.cos(a), Math.sin(a));
    const scale = Math.min(aspect / (b.maxX - b.minX), 1 / (b.maxY - b.minY));
    if (scale > bestScale + 1e-9) {
      bestScale = scale;
      best = a;
    }
  }
  return best;
}

export function fitTransform(outline: Outline, rotation: number, width: number, height: number, pad: number): MapTransform {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const b = rotatedBounds(outline, cos, sin);
  const scale = Math.min((width - pad * 2) / (b.maxX - b.minX), (height - pad * 2) / (b.maxY - b.minY));
  return { cos, sin, cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale, ox: width / 2, oy: height / 2 };
}

/** World x/z -> map px. Writes into `out` to avoid allocation in the frame loop. */
export function project(t: MapTransform, x: number, z: number, out: [number, number]): [number, number] {
  out[0] = (x * t.cos - z * t.sin - t.cx) * t.scale + t.ox;
  out[1] = (x * t.sin + z * t.cos - t.cy) * t.scale + t.oy;
  return out;
}

/** Heading (0 = +Z, + towards +X) -> CSS rotation in degrees for an up-pointing arrow. */
export function headingToCssDeg(t: MapTransform, heading: number): number {
  const dx = Math.sin(heading);
  const dz = Math.cos(heading);
  const sx = dx * t.cos - dz * t.sin;
  const sy = dx * t.sin + dz * t.cos;
  return (Math.atan2(sx, -sy) * 180) / Math.PI;
}

/** First corner whose lap fraction is ahead of progress (wraps to the first corner). */
export function nextCornerAfter(corners: HudTrackInfo['corners'], progress: number): HudTrackInfo['corners'][number] | null {
  if (corners.length === 0) return null;
  let best: HudTrackInfo['corners'][number] | null = null;
  for (const c of corners) {
    if (c.progress > progress && (best === null || c.progress < best.progress)) best = c;
  }
  if (best) return best;
  return corners.reduce((a, c) => (c.progress < a.progress ? c : a), corners[0]);
}

/** Index range of the outline for a lap-fraction interval. */
export function outlineIndex(progress: number, n: number): number {
  const p = ((progress % 1) + 1) % 1;
  return Math.min(n - 1, Math.round(p * n));
}
