import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import { TV_LEAD, TV_SPACING, tvCameraCount, tvCameraPoint } from '@/track/tv-cameras';
import type { Terrain } from '@/world/terrain';
import type { SpatialMask } from '@/world/scenery/geo';

/**
 * Keeps trees out of every TV camera's view: a clearing round the camera and a
 * clear strip along each sight line to the car, wherever that line runs behind
 * the walls (inside of a bend, run-off areas).
 */
export function maskTvSightlines(track: Track, terrain: Terrain, mask: SpatialMask): void {
  const cam: [number, number, number] = [0, 0, 0], tgt: [number, number, number] = [0, 0, 0];
  for (let idx = 0; idx < tvCameraCount(track); idx++) {
    tvCameraPoint(track, idx, cam);
    mask.add(cam[0], cam[2], 8);
    const s0 = idx * TV_SPACING;
    for (let s = s0 - TV_LEAD; s <= s0 - TV_LEAD + TV_SPACING; s += 10) {
      pointAt(track, s, 0, tgt);
      const len = Math.hypot(tgt[0] - cam[0], tgt[2] - cam[2]);
      for (let d = 6; d < len; d += 4) {
        const x = cam[0] + ((tgt[0] - cam[0]) * d) / len, z = cam[2] + ((tgt[2] - cam[2]) * d) / len;
        if (terrain.clearance(x, z) > 0) mask.add(x, z, d < 30 ? 4.5 : 3);
      }
    }
  }
}
