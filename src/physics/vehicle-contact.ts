import { kerbHeightAt } from '@/track/kerb-profile';
import type { CarSpec } from '@/car/car-specs';
import type { KerbLayout } from '@/track/kerbs';
import type { Track } from '@/track/track-model';
import { createTrackPoint, foldAt, projectOnSection, projectToTrack, surfaceAt, type Fold, type SurfaceKind, type TrackPoint } from '@/track/track-query';
import { SURFACE } from '@/physics/tyre';

/** Ground blends between two sections of a tight bend while the farther is less than this much farther (m). */
const FOLD_BAND = 8;
const fold: Fold = { near: 0, rival: 0, nearDepth: 0, rivalDepth: 0 };
const nearTp = createTrackPoint(), rivalTp = createTrackPoint();
const smooth = (u: number) => { const c = Math.min(1, Math.max(0, u)); return c * c * (3 - 2 * c); };

/**
 * Ground height under a wheel at tp. Past the centre of a tight bend the nearest section of road changes suddenly
 * (inside The Chase T21 the two sections are 1.9 m apart in height), so the two sections blend, half each where
 * equally near, and the ground has no step. Elsewhere this is kerbHeightAt alone.
 */
function groundAt(track: Track, kerbs: KerbLayout, tp: TrackPoint, x: number, z: number): number {
  if (!foldAt(track, x, z, tp.index, fold)) return kerbHeightAt(track, kerbs, tp.index, tp.t, tp.d);
  const a = projectOnSection(track, x, z, fold.near, nearTp), b = projectOnSection(track, x, z, fold.rival, rivalTp);
  const closest = Math.min(Math.abs(a.d), Math.abs(b.d));
  // A section's share grows with the depth of its distance valley, so a new rival (depth 0) adds no step. Symmetric
  // in the two sections, so nothing changes when the nearer one changes.
  const deepest = Math.max(fold.nearDepth, fold.rivalDepth);
  const weight = (depth: number, d: number) => smooth(depth / deepest) * (1 - smooth((Math.abs(d) - closest) / FOLD_BAND));
  const wa = weight(fold.nearDepth, a.d), wb = weight(fold.rivalDepth, b.d);
  return (wa * kerbHeightAt(track, kerbs, a.index, a.t, a.d) + wb * kerbHeightAt(track, kerbs, b.index, b.t, b.d)) / (wa + wb);
}

export interface ContactCorner { x: number; z: number; k: number; c: number; h0: number }
export interface ContactBody {
  readonly track: Track;
  readonly kerbs: KerbLayout;
  readonly spec: CarSpec;
  readonly tp: TrackPoint;
  x: number; y: number; z: number; heading: number; pitch: number; roll: number;
}

/** Wheel contact sampling shared by suspension and the reset settling plane. */
export function contactPass(body: ContactBody, corners: readonly ContactCorner[], points: readonly TrackPoint[], comps: number[], surfaces: SurfaceKind[]): void {
  const { track } = body;
  const sin = Math.sin(body.heading), cos = Math.cos(body.heading);
  for (let w = 0; w < 4; w++) {
    const c = corners[w];
    const wx = body.x + c.x * cos + c.z * sin;
    const wz = body.z - c.x * sin + c.z * cos;
    const tp = projectToTrack(track, wx, wz, body.tp.index, points[w]);
    surfaces[w] = surfaceAt(track, tp.index, tp.t, tp.d, body.kerbs.left, body.kerbs.right);
    const S = SURFACE[surfaces[w]];
    let ground = groundAt(track, body.kerbs, tp, wx, wz);
    if (surfaces[w] !== 'kerb' && S.bump > 0) ground += S.bump * (0.5 + 0.5 * Math.sin(tp.s * 3.9 + w));
    const yc = body.y + c.z * Math.sin(body.pitch) + c.x * Math.sin(body.roll);
    comps[w] = ground + c.h0 - yc;
  }
}

export function settleOnGround(body: ContactBody, corners: readonly ContactCorner[], points: readonly TrackPoint[], a: number, b: number): void {
  const sin = Math.sin(body.heading), cos = Math.cos(body.heading);
  const g = corners.map((c, w) => {
    const x = body.x + c.x * cos + c.z * sin, z = body.z - c.x * sin + c.z * cos;
    return groundAt(body.track, body.kerbs, projectToTrack(body.track, x, z, body.tp.index, points[w]), x, z);
  });
  const d = body.spec.dimensions;
  body.pitch = Math.atan(((g[0] + g[1]) / 2 - (g[2] + g[3]) / 2) / d.wheelbase);
  body.roll = Math.atan(((g[0] + g[2]) / 2 - (g[1] + g[3]) / 2) / ((d.trackFront + d.trackRear) / 2));
  const groundAtCg = ((g[0] + g[1]) / 2) * (b / d.wheelbase) + ((g[2] + g[3]) / 2) * (a / d.wheelbase);
  body.y = groundAtCg + body.spec.cgHeight;
}
