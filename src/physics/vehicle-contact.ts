import type { CarSpec } from '@/car/car-specs';
import type { KerbLayout } from '@/track/kerbs';
import type { Track } from '@/track/track-model';
import { heightAt, projectToTrack, surfaceAt, type SurfaceKind, type TrackPoint } from '@/track/track-query';
import { SURFACE } from '@/physics/tyre';

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
    let ground = heightAt(track, tp.index, tp.t, tp.d);
    if (S.bump > 0) ground += S.bump * (0.5 + 0.5 * Math.sin(tp.s * 3.9 + w));
    const yc = body.y + c.z * Math.sin(body.pitch) + c.x * Math.sin(body.roll);
    comps[w] = ground + c.h0 - yc;
  }
}

export function settleOnGround(body: ContactBody, corners: readonly ContactCorner[], points: readonly TrackPoint[], a: number, b: number): void {
  const sin = Math.sin(body.heading), cos = Math.cos(body.heading);
  const g = corners.map((c, w) => {
    const tp = projectToTrack(body.track, body.x + c.x * cos + c.z * sin, body.z - c.x * sin + c.z * cos, body.tp.index, points[w]);
    return heightAt(body.track, tp.index, tp.t, tp.d);
  });
  const d = body.spec.dimensions;
  body.pitch = Math.atan(((g[0] + g[1]) / 2 - (g[2] + g[3]) / 2) / d.wheelbase);
  body.roll = Math.atan(((g[0] + g[2]) / 2 - (g[1] + g[3]) / 2) / ((d.trackFront + d.trackRear) / 2));
  const groundAtCg = ((g[0] + g[1]) / 2) * (b / d.wheelbase) + ((g[2] + g[3]) / 2) * (a / d.wheelbase);
  body.y = groundAtCg + body.spec.cgHeight;
}
