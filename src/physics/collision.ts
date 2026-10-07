import type { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, projectToTrack, sampleArray, type TrackPoint } from '@/track/track-query';
import type { ImpactReport } from '@/physics/types';
import type { Vehicle } from '@/physics/vehicle';

const RESTITUTION = 0.22;
const WALL_FRICTION = 0.32;
/** Body outline points (lateral x + left, longitudinal z + forward), metres from the CG. */
function outline(v: Vehicle): Array<[number, number]> {
  const d = v.spec.dimensions;
  // Body sides include the wheel-arch flares; the tyres' outer faces sit at the axles.
  const hw = d.width / 2 + 0.03;
  const a = d.wheelbase * (1 - v.spec.frontWeight), b = d.wheelbase - a;
  const front = a + d.frontOverhang;
  const rear = d.length - front;
  const tf = d.trackFront / 2 + d.tyreWidth / 2, tr = d.trackRear / 2 + d.tyreWidth / 2;
  return [
    [hw, front - 0.25], [-hw, front - 0.25], [hw * 0.6, front], [-hw * 0.6, front],
    [Math.max(hw, tf), a], [-Math.max(hw, tf), a], [hw, 0], [-hw, 0], [Math.max(hw, tr), -b], [-Math.max(hw, tr), -b],
    [hw, -rear + 0.2], [-hw, -rear + 0.2], [0, -rear],
  ];
}

const tp: TrackPoint = createTrackPoint();
const cache = new WeakMap<Vehicle, Array<[number, number]>>();

/** Pushes the car out of the barriers and applies impact impulses. Returns impacts > 1.2 m/s. */
export function resolveWalls(v: Vehicle, track: Track): ImpactReport[] {
  let pts = cache.get(v);
  if (!pts) { pts = outline(v); cache.set(v, pts); }
  const impacts: ImpactReport[] = [];
  const m = v.spec.massKg, I = v.spec.yawInertia;
  for (const [px, pz] of pts) {
    const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
    // Offset from CG in world x/z.
    const rx = px * cos + pz * sin;
    const rz = -px * sin + pz * cos;
    const wx = v.x + rx, wz = v.z + rz;
    projectToTrack(track, wx, wz, v.tp.index, tp);
    const left = tp.d >= 0;
    const limit = sampleArray(track, left ? track.left.wall : track.right.wall, tp.index, tp.t);
    const pen = Math.abs(tp.d) - limit;
    if (pen <= 0) continue;
    const i = tp.index;
    // Wall normal pointing back to the track.
    const nx = left ? -track.lx[i] : track.lx[i];
    const nz = left ? -track.lz[i] : track.lz[i];
    v.x += nx * pen;
    v.z += nz * pen;
    // Point velocity = v + w x r  (w about +Y): (vx + w*rz, vz - w*rx).
    const pvx = v.vx + v.yawRate * rz, pvz = v.vz - v.yawRate * rx;
    const vn = pvx * nx + pvz * nz;
    if (vn >= 0) continue;
    const rn = rz * nx - rx * nz;
    const j = (-(1 + RESTITUTION) * vn) / (1 / m + (rn * rn) / I);
    v.vx += (j * nx) / m;
    v.vz += (j * nz) / m;
    v.yawRate += (rz * j * nx - rx * j * nz) / I;
    // Scrape friction along the wall.
    const tx = -nz, tz = nx;
    const vt = (v.vx + v.yawRate * rz) * tx + (v.vz - v.yawRate * rx) * tz;
    const rt = rz * tx - rx * tz;
    const jtMax = WALL_FRICTION * j;
    const jt = Math.max(-jtMax, Math.min(jtMax, -vt / (1 / m + (rt * rt) / I)));
    v.vx += (jt * tx) / m;
    v.vz += (jt * tz) / m;
    v.yawRate += (rz * jt * tx - rx * jt * tz) / I;
    if (-vn > 1.2) impacts.push({ x: wx, y: heightAt(track, tp.index, tp.t, tp.d) + 0.4, z: wz, nx, nz, speed: -vn });
  }
  return impacts;
}
