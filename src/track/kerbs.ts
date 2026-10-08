import { KERB_CORNERS } from '@/track/kerb-data';
import { taperedKerbWidths } from '@/track/kerb-profile';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';

export interface KerbLayout {
  /** The exact line used to place the rendered rubber and these kerbs. */
  line: RacingLine;
  /** Kerb width outside the road edge per sample (m, 0 = no kerb). */
  left: Float32Array;
  right: Float32Array;
  /** 0 = flat, 1 = raised, shared by geometry and contact height. */
  leftType: Uint8Array;
  rightType: Uint8Array;
}

/**
 * Places kerbs where the racing line runs close to a road edge inside a corner
 * (apex and exit kerbs), like a real circuit. Kerbs start a little before and
 * end a little after the contact zone.
 */
export function placeKerbs(track: Track, line: RacingLine, width = 1.05): KerbLayout {
  const n = track.n;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  const near = 1.9; // line within this distance of the edge = kerb contact
  for (let i = 0; i < n; i++) {
    if (Math.abs(line.curvature[i]) < 1 / 450) continue;
    if (track.left.edge[i] - line.offset[i] < near) left[i] = 1;
    if (track.right.edge[i] + line.offset[i] < near) right[i] = 1;
  }
  const grow = (a: Float32Array) => {
    const out = new Float32Array(n);
    const pad = Math.round(14 / track.spacing);
    for (let i = 0; i < n; i++) {
      if (!a[i]) continue;
      for (let k = -pad; k <= pad; k++) out[(i + k + n) % n] = 1;
    }
    // Remove tiny kerb fragments.
    const minRun = Math.round(18 / track.spacing);
    let i = 0;
    while (i < n) {
      if (!out[i]) { i++; continue; }
      let j = i;
      while (j < n && out[j]) j++;
      if (j - i < minRun) for (let k = i; k < j; k++) out[k] = 0;
      i = j;
    }
    for (let k = 0; k < n; k++) out[k] *= width;
    return out;
  };
  const l = grow(left), r = grow(right);
  const leftType = new Uint8Array(n), rightType = new Uint8Array(n);
  for (const data of KERB_CORNERS) {
    const corner = track.corners.find((c) => c.turn === data.turn);
    if (!corner) continue;
    const widths = corner.dir === 'L' ? l : r, types = corner.dir === 'L' ? leftType : rightType;
    for (let i = 0; i < n; i++) {
      const distance = Math.abs(i * track.spacing - corner.s);
      if (Math.min(distance, track.length - distance) >= data.halfLength) continue;
      widths[i] = data.width;
      types[i] = data.type === 'raised' ? 1 : 0;
    }
  }
  // A kerb never extends past the barrier.
  for (let i = 0; i < n; i++) {
    l[i] = Math.min(l[i], Math.max(0, track.left.wall[i] - track.left.edge[i] - 0.3));
    r[i] = Math.min(r[i], Math.max(0, track.right.wall[i] - track.right.edge[i] - 0.3));
  }
  return { left: taperedKerbWidths(l), right: taperedKerbWidths(r), leftType, rightType, line };
}
