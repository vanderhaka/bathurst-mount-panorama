import type { Track } from '@/track/track-model';

export interface MaskBox { x0: number; z0: number; x1: number; z1: number }

/** Squared distance from (x, z) to the segment a-b. */
function segmentDistanceSq(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const ex = bx - ax, ez = bz - az, len = ex * ex + ez * ez;
  const t = len > 0 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / len)) : 0;
  return (x - ax - ex * t) ** 2 + (z - az - ez * t) ** 2;
}

/**
 * Conservative raster of the ground that can lie within `reach` metres of the centreline polyline.
 * `false` guarantees that the point is farther away, so callers can skip the (global) track projection;
 * points outside the box always report `true`.
 */
export function createCorridorMask(track: Track, box: MaskBox, reach: number, cell = 16): (x: number, z: number) => boolean {
  const nx = Math.ceil((box.x1 - box.x0) / cell), nz = Math.ceil((box.z1 - box.z0) / cell);
  const near = new Uint8Array(nx * nz);
  // A cell is near when its centre lies within reach plus the half diagonal of any segment.
  const radius = reach + cell * Math.SQRT1_2, radiusSq = radius * radius;
  for (let i = 0; i < track.n; i++) {
    const j = track.wrap(i + 1);
    const ax = track.px[i], az = track.pz[i], bx = track.px[j], bz = track.pz[j];
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx) - radius - box.x0) / cell));
    const gx1 = Math.min(nx - 1, Math.floor((Math.max(ax, bx) + radius - box.x0) / cell));
    const gz0 = Math.max(0, Math.floor((Math.min(az, bz) - radius - box.z0) / cell));
    const gz1 = Math.min(nz - 1, Math.floor((Math.max(az, bz) + radius - box.z0) / cell));
    for (let gz = gz0; gz <= gz1; gz++) for (let gx = gx0; gx <= gx1; gx++) {
      const k = gz * nx + gx;
      if (near[k]) continue;
      const cx = box.x0 + (gx + 0.5) * cell, cz = box.z0 + (gz + 0.5) * cell;
      if (segmentDistanceSq(cx, cz, ax, az, bx, bz) <= radiusSq) near[k] = 1;
    }
  }
  return (x, z) => {
    const gx = Math.floor((x - box.x0) / cell), gz = Math.floor((z - box.z0) / cell);
    return gx < 0 || gz < 0 || gx >= nx || gz >= nz || near[gz * nx + gx] === 1;
  };
}
