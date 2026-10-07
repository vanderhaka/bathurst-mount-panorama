import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';

export interface KerbLayout {
  /** Kerb width outside the road edge per sample (m, 0 = no kerb). */
  left: Float32Array;
  right: Float32Array;
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
  // A kerb never extends past the barrier.
  for (let i = 0; i < n; i++) {
    l[i] = Math.min(l[i], Math.max(0, track.left.wall[i] - track.left.edge[i] - 0.3));
    r[i] = Math.min(r[i], Math.max(0, track.right.wall[i] - track.right.edge[i] - 0.3));
  }
  return { left: l, right: r };
}
