import * as THREE from 'three';
import type { FaceInfo } from '@/props/core/mesher';
import { Mesher } from '@/props/core/mesher';
import { cylinderX } from '@/props/core/prims';
import { loftRings } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';

// Lofted vehicle bodies: cross-section rings at stations along Z (rear → front).
// Each station: [z, bottom, belt, roof, halfWidth, roofHalfWidth]. roof <= belt
// means no cabin at that station (bonnet / boot / tray).

export type Station = [z: number, bottom: number, belt: number, roof: number, w: number, wr: number];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function ring(s: Station): THREE.Vector3[] {
  const [z, yb, belt, roof, w, wr] = s;
  const cabin = roof > belt + 0.05;
  const top = cabin ? roof : belt + 0.04;
  const sideTop = cabin ? roof - 0.07 : belt + 0.02;
  const rw = cabin ? wr : w * 0.96;
  // Counter-clockwise seen from the front (+Z) so faces point outwards.
  const half = [V(w * 0.9, yb, z), V(w, yb + 0.12, z), V(w, belt, z), V(rw, sideTop, z), V(rw * 0.82, top, z)];
  const mirror = half.map((p) => V(-p.x, p.y, p.z)).reverse();
  return [...half, ...mirror];
}

export interface BodyPaint {
  /** Body colour (white = takes the instance colour when `tintBody`). */
  body: number;
  glass?: number;
  trim?: number;
  /** Extra rule evaluated first (stripes, doors); return undefined to fall through. */
  extra?: (f: FaceInfo, belt: number) => number | THREE.Color | undefined;
  /** Faces that take the instance colour (painted white), besides the body when tintBody is set. */
  tint?: (f: FaceInfo) => boolean;
}

/** Linear interpolation of station values along z. */
export function stationAt(stations: Station[], z: number, field: 1 | 2 | 3 | 4): number {
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (z >= a[0] && z <= b[0]) return THREE.MathUtils.lerp(a[field], b[field], (z - a[0]) / (b[0] - a[0] || 1));
  }
  return z < stations[0][0] ? stations[0][field] : stations[stations.length - 1][field];
}

/** Adds the lofted body. Glass = faces above the belt that are not roof tops (in cabin spans). */
export function addBody(m: Mesher, stations: Station[], paint: BodyPaint, tintBody: boolean): void {
  const look = PROPS_LOOK.vehicles;
  const glass = paint.glass ?? look.glass;
  const trim = paint.trim ?? look.trim;
  const g = loftRings(stations.map(ring), { capStart: true, capEnd: true });
  // The cabin spans from the station before the first roofed station to the one after the last.
  const roofed = stations.map((s, i) => (s[3] > s[2] + 0.05 ? i : -1)).filter((i) => i >= 0);
  const z0 = stations[Math.max(0, roofed[0] - 1)][0];
  const z1 = stations[Math.min(stations.length - 1, roofed[roofed.length - 1] + 1)][0];
  const inCabin = (z: number) => roofed.length > 0 && z > z0 && z < z1;
  const colourOf = (f: FaceInfo): number | THREE.Color => {
    const z = f.centroid.z;
    const belt = stationAt(stations, z, 2);
    const bottom = stationAt(stations, z, 1);
    const e = paint.extra?.(f, belt);
    if (e !== undefined) return e;
    if (f.centroid.y < bottom + 0.1) return trim;
    // Glass: anything clearly above the belt line that is not a near-flat roof panel
    // (side windows, windscreen, rear window).
    if (inCabin(z) && f.centroid.y > belt + 0.06 && f.normal.y < 0.9) return glass;
    return paint.body;
  };
  // Body faces are tintable only where they are painted with the body colour.
  const pos = g.getAttribute('position');
  const tinted: number[] = [];
  const fixed: number[] = [];
  const info: FaceInfo = { centroid: new THREE.Vector3(), normal: new THREE.Vector3(), index: 0 };
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    info.centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    info.normal.copy(b.clone().sub(a)).cross(c.clone().sub(a)).normalize();
    const col = colourOf(info);
    const list = (tintBody && col === paint.body) || paint.tint?.(info) ? tinted : fixed;
    list.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const part = (arr: number[]) => new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  if (tinted.length) m.add(part(tinted), 0xffffff, { tint: true });
  if (fixed.length) m.add(part(fixed), colourOf);
}

/** Wheel: 12-sided tyre with a silver hub disc on the outer face. Axis along X. */
export function addWheel(m: Mesher, x: number, z: number, radius: number, width: number, side: 1 | -1, sides = 12): void {
  const look = PROPS_LOOK.vehicles;
  m.add(cylinderX(radius, width, sides, x, radius, z), look.tyre);
  m.add(cylinderX(radius * 0.58, 0.02, sides > 10 ? 8 : 6, x + side * (width / 2), radius, z), look.chrome);
}

/** Box-body station for caravans and camper bodies: [z, bottom, top, halfWidth]. */
export type BoxStation = [z: number, bottom: number, top: number, w: number];

/**
 * Box loft with extra ring points at the given heights (so windows, stripes and
 * doors can be painted per face). Top corners are chamfered.
 */
export function boxLoft(stations: BoxStation[], levels: number[], chamfer = 0.12): THREE.BufferGeometry {
  // Every ring gets every level (clamped into its own height range) so point counts match;
  // clamped duplicates only make degenerate faces, which the Mesher drops.
  const rings = stations.map(([z, yb, yt, w]) => {
    const top = yt - chamfer;
    const ys = [yb, ...levels.map((y) => THREE.MathUtils.clamp(y, yb, top)), top];
    const half = [...ys.map((y) => V(w, y, z)), V(w - chamfer, yt, z)];
    return [...half, ...half.map((p) => V(-p.x, p.y, p.z)).reverse()];
  });
  return loftRings(rings, { capStart: true, capEnd: true });
}
