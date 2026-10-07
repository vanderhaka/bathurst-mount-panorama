import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher, type FaceInfo } from '@/props/core/mesher';
import { cylinder, cylinderZ } from '@/props/core/prims';
import { box, quad, strut } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';
import { addBody, addWheel, boxLoft, type BoxStation } from '@/props/builders/vehicle-body';

// Caravans and campervans. The body is fixed white; the decal stripe takes the
// instance colour. Front = +Z (drawbar / cab), door on the kerb side (+X).

export const CARAVAN_VARIANTS = { caravan: 3, campervan: 3 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
type Range = [number, number];
const inR = (v: number, [a, b]: Range) => v >= a && v <= b;

interface Livery {
  stripe: Range;
  windowBand: Range;
  windows: Range[];
  door: Range;
  doorTop: number;
  skirt: number;
  frontWindow?: Range;
}

/** Glass (or door) panel on a side wall at x = ±x, from z0 to z1 and y0 to y1, facing outwards. */
function sidePanel(m: Mesher, x: number, z0: number, z1: number, y0: number, y1: number, colour: number | THREE.Color): void {
  if (x > 0) m.add(quad(V(x, y0, z1), V(x, y0, z0), V(x, y1, z0), V(x, y1, z1)), colour);
  else m.add(quad(V(x, y0, z0), V(x, y0, z1), V(x, y1, z1), V(x, y1, z0)), colour);
}

/**
 * Box body: lofted shell painted body / skirt / decal stripe (the stripe is pure
 * white and takes the instance colour), then window and door panels laid on the sides.
 */
function addBoxBody(m: Mesher, stations: BoxStation[], l: Livery, body: number, chamfer = 0.12): void {
  const look = PROPS_LOOK.vehicles;
  const colour = (f: FaceInfo): number => {
    if (f.centroid.y < l.skirt) return look.trim;
    if (inR(f.centroid.y, l.stripe) && Math.abs(f.normal.y) < 0.5) return 0xffffff;
    return body;
  };
  m.add(boxLoft(stations, [l.skirt, ...l.stripe], chamfer), colour, { tint: 'white' });
  const w = Math.max(...stations.map((s) => s[3])) + 0.012;
  for (const s of [-1, 1]) for (const [z0, z1] of l.windows) sidePanel(m, s * w, z0, z1, l.windowBand[0], l.windowBand[1], look.glass);
  sidePanel(m, w + 0.004, l.door[0], l.door[1], l.skirt + 0.08, l.doorTop, new THREE.Color().setHex(body).multiplyScalar(0.86));
  sidePanel(m, w + 0.008, l.door[0] + 0.15, l.door[1] - 0.15, l.doorTop - 0.75, l.doorTop - 0.2, look.glass);
  if (l.frontWindow) {
    const front = stations[stations.length - 1];
    const z = front[0] + 0.012;
    m.add(quad(V(-0.8, l.frontWindow[0], z), V(0.8, l.frontWindow[0], z), V(0.8, l.frontWindow[1], z), V(-0.8, l.frontWindow[1], z)), look.glass);
  }
}

/**
 * Roll-out awning on the +X (door) side: roller box on the body, a sloping striped
 * sheet (tinted stripes alternate with fixed off-white ones) with a front valance,
 * two legs at the outer corners and an annex mat on the ground.
 */
function addAwning(m: Mesher, x: number, z0: number, z1: number, yRoll: number, out: number, drop: number): void {
  const look = PROPS_LOOK.camping;
  const xo = x + out;
  const yo = yRoll - drop;
  m.add(box(0.14, 0.14, z1 - z0 + 0.2, x + 0.07, yRoll, (z0 + z1) / 2), BUILDING.white);
  const n = Math.max(4, Math.round((z1 - z0) / 0.55));
  for (let i = 0; i < n; i++) {
    const za = z0 + ((z1 - z0) * i) / n;
    const zb = z0 + ((z1 - z0) * (i + 1)) / n;
    const tinted = i % 2 === 0;
    const colour = tinted ? 0xffffff : look.awningStripe;
    // Upper face first (+Y), then the valance hanging from the outer bar.
    m.add(quad(V(x, yRoll, zb), V(xo, yo, zb), V(xo, yo, za), V(x, yRoll, za), true), colour, { tint: tinted });
    m.add(quad(V(xo, yo - 0.25, za), V(xo, yo - 0.25, zb), V(xo, yo, zb), V(xo, yo, za), true), colour, { tint: tinted });
  }
  for (const z of [z0 + 0.05, z1 - 0.05]) m.add(strut(V(xo, 0, z), V(xo, yo, z), 0.025, 4), TRACKSIDE.armco);
  m.add(strut(V(xo, yo, z0), V(xo, yo, z1), 0.03, 4), TRACKSIDE.armco);
  m.add(quad(V(x + 0.1, 0.02, z1), V(xo + 0.2, 0.02, z1), V(xo + 0.2, 0.02, z0), V(x + 0.1, 0.02, z0)), look.annexMat);
}

export function buildCaravan(variant: number): BuiltProp {
  const m = new Mesher(true);
  const white = BUILDING.white;
  const yB = variant === 2 ? 0.72 : 0.45;
  const yT = variant === 1 ? 2.15 : variant === 2 ? 2.8 : 2.62;
  const w = variant === 2 ? 1.14 : 1.15;
  const L = variant === 0 ? 2.8 : variant === 1 ? 2.5 : 2.9;
  const stations: BoxStation[] = [
    [-L, yB + 0.04, yT - 0.12, w - 0.04],
    [-L + 0.08, yB, yT, w],
    [L - 0.55, yB, yT, w],
    [L - 0.22, yB + 0.02, yT - 0.3, w],
    [L, yB + 0.06, yT - 0.85, w - 0.05],
  ];
  const livery: Livery = {
    stripe: [yB + 0.38, yB + 0.62],
    windowBand: [yB + 0.95, yB + 1.5],
    windows: [[-L + 0.5, -L + 1.6], [0.7, L - 0.7]],
    door: [-0.6, 0.15],
    doorTop: yB + 1.85,
    skirt: yB + 0.12,
    frontWindow: variant === 1 ? undefined : [yT - 1.45, yT - 0.95],
  };
  addBoxBody(m, stations, livery, variant === 2 ? BUILDING.offWhite : white);
  if (variant === 1) {
    // Pop-top: canvas band and a raised roof cap.
    m.add(box(2 * w - 0.25, 0.32, 2 * L - 1.2, 0, yT + 0.16, -0.2), BUILDING.grey);
    m.add(box(2 * w - 0.1, 0.1, 2 * L - 1.0, 0, yT + 0.37, -0.2), white);
  } else {
    m.add(box(0.7, 0.14, 0.7, 0, yT + 0.07, -0.8), BUILDING.offWhite);
  }
  if (variant === 2) {
    // Off-road: chequer-plate stone guard, spare wheel, jerry cans.
    m.add(box(2 * w + 0.04, 0.6, 0.06, 0, yB + 0.3, L + 0.02), TRACKSIDE.armco);
    m.add(cylinderZ(0.4, 0.26, 10, 0, yB + 0.75, -L - 0.15), PROPS_LOOK.vehicles.tyre);
  }
  // Awning out over the door side (length varies with the van).
  addAwning(m, w + 0.01, -L + (variant === 1 ? 0.8 : 0.5), L - (variant === 0 ? 0.9 : 0.7), yT - 0.12, variant === 1 ? 2.2 : 2.5, 0.45);
  // Drawbar, gas bottles, jockey wheel.
  const hitch = V(0, yB, L + 1.35);
  for (const s of [-1, 1]) m.add(strut(V(s * 0.55, yB, L - 0.3), hitch, 0.05, 4), BUILDING.darkGrey);
  for (const s of [-1, 1]) m.add(cylinder(0.16, 0.16, yB, yB + 0.62, 6).translate(s * 0.2, 0, L + 0.4), BUILDING.white);
  m.add(strut(V(0, 0, L + 1.0), V(0, yB + 0.3, L + 1.0), 0.04, 4), BUILDING.darkGrey);
  // Wheels (single or tandem axle) with mudguards and tail lights.
  const axles = variant === 0 ? [0] : [-0.45, 0.45];
  const r = variant === 2 ? 0.4 : 0.34;
  for (const z of axles) for (const s of [-1, 1] as const) addWheel(m, s * (w - 0.08), z, r, 0.22, s, 10);
  for (const s of [-1, 1]) {
    m.add(box(0.12, 0.04, axles.length * 0.9 + 0.3, s * (w + 0.04), r * 2 + 0.06, 0), BUILDING.darkGrey);
    m.add(box(0.22, 0.12, 0.04, s * (w - 0.2), yB + 0.25, -L - 0.01), PROPS_LOOK.vehicles.tailLight);
  }
  return { geometry: m.build(), radius: L + 1.4 };
}

/** Campervans: hi-top van, pop-top van, C-class motorhome with a luton over the cab. */
export function buildCampervan(variant: number): BuiltProp {
  const m = new Mesher(true);
  const white = BUILDING.white;
  const look = PROPS_LOOK.vehicles;
  if (variant === 2) {
    const yB = 0.55;
    const yT = 3.15;
    const stations: BoxStation[] = [[-3.5, yB + 0.05, yT - 0.1, 1.15], [-3.42, yB, yT, 1.18], [1.2, yB, yT, 1.18], [1.75, 2.2, yT - 0.05, 1.15], [2.35, 2.35, yT - 0.35, 1.1]];
    const livery: Livery = { stripe: [0.85, 1.25], windowBand: [1.45, 2.05], windows: [[-2.9, -1.8], [-0.3, 0.7]], door: [-1.4, -0.7], doorTop: 2.6, skirt: yB + 0.1 };
    addBoxBody(m, stations, livery, white);
    addBody(m, [[1.15, 0.45, 1.05, 2.3, 1.05, 0.95], [2.3, 0.45, 1.05, 2.3, 1.05, 0.95], [2.9, 0.45, 1.0, 0, 1.04, 0], [3.4, 0.5, 0.9, 0, 1.0, 0], [3.55, 0.55, 0.75, 0, 0.95, 0]], { body: white }, false);
    for (const z of [-1.9, 2.75]) for (const s of [-1, 1] as const) addWheel(m, s * 0.93, z, 0.38, 0.24, s);
    for (const s of [-1, 1]) m.add(box(0.3, 0.14, 0.04, s * 0.95, 0.85, -3.52), look.tailLight);
    addAwning(m, 1.19, -3.2, 0.9, yT - 0.15, 2.6, 0.55);
    return { geometry: m.build(), radius: 3.9 };
  }
  const L = variant === 0 ? 2.7 : 2.35;
  const hiTop = variant === 0;
  const yT = hiTop ? 2.6 : 1.98;
  const box0: BoxStation[] = [[-L, 0.42, yT - 0.05, 0.96], [-L + 0.06, 0.4, yT, 0.98], [hiTop ? 0.8 : 0.6, 0.4, yT, 0.98], ...(hiTop ? ([[1.25, 0.4, 2.1, 0.97]] as BoxStation[]) : [])];
  const livery: Livery = { stripe: [0.55, 0.95], windowBand: [1.15, 1.65], windows: [[-L + 0.35, -L + 1.3], [-0.6, 0.4]], door: [-1.6, -0.75], doorTop: 1.9, skirt: 0.52 };
  addBoxBody(m, box0, livery, white, 0.15);
  const cabZ = hiTop ? 1.2 : 0.55;
  addBody(m, [[cabZ - 0.1, 0.4, 1.05, 2.0, 0.98, 0.9], [cabZ + 0.45, 0.4, 1.05, 1.98, 0.98, 0.9], [cabZ + 1.0, 0.4, 1.0, 0, 0.98, 0], [cabZ + 1.4, 0.45, 0.92, 0, 0.96, 0], [cabZ + 1.55, 0.5, 0.75, 0, 0.92, 0]], { body: white }, false);
  if (!hiTop) {
    // Pop-top roof raised with canvas sides.
    m.add(box(1.7, 0.4, 2.6, 0, yT + 0.2, -0.9), BUILDING.grey);
    m.add(box(1.85, 0.08, 2.8, 0, yT + 0.44, -0.9), white);
  }
  const front = cabZ + 1.55;
  for (const s of [-1, 1]) {
    m.add(box(0.28, 0.12, 0.05, s * 0.68, 0.8, front - 0.02), look.headLight);
    m.add(box(0.2, 0.3, 0.05, s * 0.9, 0.9, -L - 0.01), look.tailLight);
  }
  for (const z of [-L + 0.75, front - 0.85]) for (const s of [-1, 1] as const) addWheel(m, s * 0.84, z, 0.34, 0.22, s);
  addAwning(m, 0.99, -L + 0.2, hiTop ? 0.75 : 0.55, yT - 0.12, hiTop ? 2.3 : 2.0, hiTop ? 0.5 : 0.35);
  return { geometry: m.build(), radius: Math.max(L, front) + 0.1 };
}
