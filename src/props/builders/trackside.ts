import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { cylinder } from '@/props/core/prims';
import { box, lathe, place, quad, tube } from '@/props/core/shapes';
import type { BuiltProp } from '@/props/kinds-types';

// Tyre stacks, catch-fence posts, braking-marker boards and advertising hoardings.

export const TRACKSIDE_VARIANTS = { tyreStack: 5, trackPole: 3, distanceBoard: 3, billboard: 4 } as const;

const TYRE_R = 0.3;
const TYRE_H = 0.2;

/** Column of 4-6 tyres as one lathe: bulging treads with grooves between, a dark hole on top. */
export function buildTyreStack(variant: number): BuiltProp {
  const n = [5, 6, 4, 5, 5][variant];
  const H = n * TYRE_H;
  const profile: Array<[number, number]> = [[0.262, 0]];
  for (let i = 0; i < n; i++) {
    profile.push([TYRE_R, i * TYRE_H + TYRE_H * 0.5]);
    profile.push([i === n - 1 ? 0.278 : 0.262, (i + 1) * TYRE_H]);
  }
  profile.push([0.2, H - 0.025]);
  const m = new Mesher();
  const tyre = new THREE.Color().setHex(TRACKSIDE.tyre);
  m.add(lathe(profile, 10, { capEnd: true, phase: variant * 0.3 }), (f) => {
    if (f.normal.y > 0.9 && f.centroid.y > H - 0.03) return tyre.clone().multiplyScalar(0.45);
    const k = Math.floor(f.centroid.y / TYRE_H);
    return tyre.clone().multiplyScalar(0.85 + ((k * 37) % 5) * 0.08);
  }, { jitter: 0.04 });
  if (variant >= 3) {
    // Conveyor-belt cover on the track face (rows of stacks form a continuous belt).
    const c = variant === 3 ? TRACKSIDE.tyreBeltWhite : TRACKSIDE.tyreBeltBlue;
    m.add(box(0.64, H + 0.04, 0.02, 0, (H + 0.04) / 2, TYRE_R + 0.012), c);
  }
  return { geometry: m.build(), radius: TYRE_R, height: H };
}

/** Catch-fence post: galvanised pipe on a base plate, cranked towards the track (+Z) at the top. */
export function buildTrackPole(variant: number): BuiltProp {
  const h = [4.0, 3.0, 4.6][variant];
  const m = new Mesher();
  const steel = TRACKSIDE.fencePost;
  const bend = new THREE.Vector3(0, h - 0.7, 0);
  const top = bend.clone().add(new THREE.Vector3(0, 0.6, 0.35));
  m.add(tube([new THREE.Vector3(0, 0, 0), bend, top], 0.055, 6, { capEnd: true, phase: Math.PI / 6 }), steel, { jitter: 0.03 });
  m.add(box(0.26, 0.03, 0.26, 0, 0.015, 0), TRACKSIDE.concreteDark);
  if (variant !== 0) {
    // Cable brackets on the track side.
    for (const y of variant === 1 ? [0.9, 2.2] : [0.9, 2.2, 3.4]) m.add(box(0.05, 0.08, 0.12, 0, y, 0.09), steel);
  }
  return { geometry: m.build(), radius: 0.3, height: h };
}

/** V-shaped chevron (two arms), facing +Z. */
function chevron(y: number, w: number, h: number, t: number, z: number): THREE.BufferGeometry[] {
  const p = (x: number, yy: number) => new THREE.Vector3(x, yy, z);
  return [quad(p(-w, y + h), p(-w, y + h - t), p(0, y - t), p(0, y)), quad(p(0, y), p(0, y - t), p(w, y + h - t), p(w, y + h))];
}

/** Braking marker: white board on two posts with 3/2/1 black chevrons (300/200/100 m), no digits. */
export function buildDistanceBoard(variant: number): BuiltProp {
  const count = 3 - variant;
  const m = new Mesher();
  const bw = 1.0;
  const bh = 1.5;
  const y0 = 0.7;
  m.add(box(bw, bh, 0.05, 0, y0 + bh / 2, 0), (f) => (f.normal.z > 0.9 ? TRACKSIDE.tyreBeltWhite : BUILDING.grey));
  // Black border.
  const z = 0.026;
  const b = 0.05;
  for (const [x, y, w, h] of [[0, y0 + b / 2, bw, b], [0, y0 + bh - b / 2, bw, b], [-bw / 2 + b / 2, y0 + bh / 2, b, bh], [bw / 2 - b / 2, y0 + bh / 2, b, bh]]) {
    m.add(quadAt(x, y, w, h, z), TRACKSIDE.tyre);
  }
  const span = bh - 0.3;
  for (let i = 0; i < count; i++) {
    const cy = y0 + 0.15 + span * ((i + 0.5) / 3) + (3 - count) * span * 0.5 / 3;
    for (const g of chevron(cy - 0.12, 0.34, 0.26, 0.11, z + 0.002)) m.add(g, TRACKSIDE.tyre);
  }
  for (const x of [-0.32, 0.32]) m.add(box(0.07, y0 + bh - 0.05, 0.07, x, (y0 + bh - 0.05) / 2, -0.06), TRACKSIDE.fencePost);
  return { geometry: m.build(), radius: 0.55, height: y0 + bh };
}

function quadAt(x: number, y: number, w: number, h: number, z: number): THREE.BufferGeometry {
  return quad(new THREE.Vector3(x - w / 2, y - h / 2, z), new THREE.Vector3(x + w / 2, y - h / 2, z), new THREE.Vector3(x + w / 2, y + h / 2, z), new THREE.Vector3(x - w / 2, y + h / 2, z));
}

/** Advertising hoarding. Panel face is white (takes the instance colour); frame and legs keep theirs. */
export function buildBillboard(variant: number): BuiltProp {
  const m = new Mesher(true);
  const frame = BUILDING.darkGrey;
  const legs = TRACKSIDE.fencePost;
  const panel = (w: number, h: number, y: number, tilt = 0) => {
    const g = box(w, h, 0.08, 0, 0, 0);
    place(g, 0, y + h / 2, 0, -tilt);
    m.add(g, (f) => (f.normal.z > 0.9 ? 0xffffff : BUILDING.grey), { tint: 'white' });
    const fr = box(w + 0.08, h + 0.08, 0.06, 0, 0, -0.04);
    place(fr, 0, y + h / 2, 0, -tilt);
    m.add(fr, frame);
  };
  if (variant === 0) {
    // Low trackside hoarding on short legs.
    panel(6, 1.1, 0.25);
    for (const x of [-2.6, 0, 2.6]) m.add(box(0.08, 0.35, 0.5, x, 0.175, -0.1), legs);
  } else if (variant === 1) {
    // A-frame sign on the grass.
    const tilt = 0.26;
    panel(2.5, 1.0, 0.02, tilt);
    const back = box(2.5, 1.0, 0.04, 0, 0, 0);
    place(back, 0, 0.52, -0.3, tilt);
    m.add(back, BUILDING.grey);
  } else if (variant === 2) {
    // Roadside billboard on two steel posts with a service walkway.
    panel(6, 3, 2.6);
    for (const x of [-1.9, 1.9]) m.add(box(0.25, 2.6, 0.25, x, 1.3, -0.15), legs);
    m.add(box(6.2, 0.06, 0.6, 0, 2.5, 0.35), BUILDING.darkGrey);
  } else {
    // Tall portrait sign.
    panel(2, 3.4, 0.9);
    for (const x of [-0.75, 0.75]) m.add(cylinder(0.06, 0.06, 0, 0.95, 6).translate(x, 0, -0.08), legs);
  }
  const r = [3.05, 1.3, 3.1, 1.05][variant];
  return { geometry: m.build(), radius: r };
}
