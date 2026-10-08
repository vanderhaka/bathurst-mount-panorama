import type { KerbLayout } from '@/track/kerbs';
import type { Track } from '@/track/track-model';
import { heightAt, sampleArray, VERGE_FALL } from '@/track/track-query';

/** Height above the road-edge plane: flat peaks at 12 mm, raised at the existing 65 mm. */
export function kerbProfileHeight(u: number, width: number, raised = 1): number {
  const p = u < 0.25 ? u / 0.25 : 1 - ((u - 0.25) / 0.75) * 0.55;
  return 0.004 * raised + (0.012 + 0.049 * raised) * p * Math.min(1, width / 0.6);
}

/** Shared end ramps: the physics width is the width actually drawn. Handles the lap seam. */
export function taperedKerbWidths(arr: Float32Array): Float32Array {
  const out = Float32Array.from(arr), n = arr.length, ramp = 3;
  for (let i = 0; i < n; i++) {
    if (arr[i] <= 0) continue;
    let end = ramp;
    for (let k = 1; k <= ramp; k++) {
      if (arr[(i + k) % n] <= 0 || arr[(i - k + n) % n] <= 0) { end = k - 1; break; }
    }
    out[i] *= Math.min(1, (end + 0.5) / (ramp + 0.5));
  }
  return out;
}

/** Wheel ground height from the same width, type and cross-section as the rendered strip. */
export function kerbHeightAt(track: Track, kerbs: KerbLayout, index: number, t: number, d: number): number {
  const sign = d >= 0 ? 1 : -1, side = sign > 0 ? track.left : track.right;
  const edge = sampleArray(track, side.edge, index, t), outside = Math.abs(d) - edge;
  const width = sampleArray(track, sign > 0 ? kerbs.left : kerbs.right, index, t);
  if (outside <= 0 || width <= 0.05 || outside > width) return heightAt(track, index, t, d);
  const raised = sampleArray(track, sign > 0 ? kerbs.leftType : kerbs.rightType, index, t);
  return heightAt(track, index, t, sign * edge) + kerbProfileHeight(outside / width, width, raised);
}

/** Lateral slope used by the tyre's ground reaction, preserving ordinary road and verge. */
export function kerbCrossfallAt(track: Track, kerbs: KerbLayout, index: number, t: number, d: number): number {
  const sign = d >= 0 ? 1 : -1, side = sign > 0 ? track.left : track.right;
  const edge = sampleArray(track, side.edge, index, t), outside = Math.abs(d) - edge;
  if (outside <= 0) return Math.tan(sampleArray(track, track.bank, index, t));
  const width = sampleArray(track, sign > 0 ? kerbs.left : kerbs.right, index, t);
  if (width <= 0.05 || outside > width) return -VERGE_FALL * sign;
  const raised = sampleArray(track, sign > 0 ? kerbs.leftType : kerbs.rightType, index, t);
  const slope = outside / width < 0.25 ? 4 : -0.55 / 0.75;
  return sign * (0.012 + 0.049 * raised) * slope * Math.min(1, width / 0.6) / width;
}
