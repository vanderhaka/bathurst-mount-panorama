import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { cylinder, skillionRoof } from '@/props/core/prims';
import { box, quad, strut } from '@/props/core/shapes';
import type { BuiltProp } from '@/props/kinds-types';

// Flag-marshal posts and portable toilets.

export const HUT_VARIANTS = { marshalPost: 3, portaloo: 4 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Orange post-number board with a white number plate, facing +Z (orange frame, white centre). */
function numberBoard(m: Mesher, x: number, y: number, z: number, w: number, h: number): void {
  m.add(box(w, h, 0.05, x, y, z), TRACKSIDE.marshalOrange);
  const pw = w * 0.62;
  const ph = h * 0.62;
  m.add(quad(V(x - pw / 2, y - ph / 2, z + 0.027), V(x + pw / 2, y - ph / 2, z + 0.027), V(x + pw / 2, y + ph / 2, z + 0.027), V(x - pw / 2, y + ph / 2, z + 0.027)), TRACKSIDE.tyreBeltWhite);
}

/** Orange flag bin with furled flags (yellow, blue, white, red) standing in it. */
function flagBin(m: Mesher, x: number, y: number, z: number, flags: number): void {
  m.add(box(0.5, 0.7, 0.36, x, y + 0.35, z), TRACKSIDE.marshalOrange);
  const colours = [BUILDING.accentYellow, BUILDING.accentBlue, BUILDING.white, BUILDING.accentRed];
  for (let i = 0; i < flags; i++) {
    const fx = x - 0.15 + i * 0.12;
    const top = y + 1.35 + (i % 2) * 0.12;
    m.add(strut(V(fx, y + 0.3, z - 0.05 + (i % 2) * 0.08), V(fx + 0.04, top, z - 0.05 + (i % 2) * 0.08), 0.012, 3), BUILDING.darkGrey);
    // Furled flag: a narrow cloth hanging down the pole from the top.
    const zf = z - 0.05 + (i % 2) * 0.08;
    m.add(quad(V(fx + 0.02, top - 0.6, zf), V(fx + 0.17, top - 0.5, zf), V(fx + 0.15, top - 0.02, zf), V(fx + 0.03, top - 0.02, zf), true), colours[i % colours.length]);
  }
}

/** Corner posts (square steel) from the base to a skillion roof that rises towards the front. */
function posts(m: Mesher, xs: number[], zs: number[], y0: number, frontY: number, backY: number, zFront: number, zBack: number): void {
  for (const x of xs) {
    for (const z of zs) {
      const t = (z - zBack) / (zFront - zBack);
      m.add(strut(V(x, y0, z), V(x, backY + (frontY - backY) * t, z), 0.045, 4), BUILDING.white);
    }
  }
}

/**
 * Marshal post (front, +Z, faces the track): open-fronted shelter with a pale
 * skillion roof on slim posts, a low concrete base, a bench, a flag bin and an
 * orange number board. Orange is kept to the board, the bin and one thin band.
 */
export function buildMarshalPost(variant: number): BuiltProp {
  const m = new Mesher();
  const white = BUILDING.white;
  const pale = BUILDING.offWhite;
  if (variant === 0) {
    // Trackside shelter behind the wall (the post the world places).
    const [hx, hz] = [1.25, 0.95];
    const [frontY, backY] = [2.8, 2.5];
    m.add(box(2.9, 0.25, 2.3, 0, 0.125, 0), TRACKSIDE.concrete);
    posts(m, [-hx, hx], [-hz, hz], 0.25, frontY, backY, hz, -hz);
    m.add(skillionRoof(3.0, 2.6, frontY + 0.05, backY + 0.05, 0.1, 0, 0.05), white);
    // Back wall (full height) with an orange band; half-height side screens at the back.
    m.add(box(2.5, backY - 0.3, 0.06, 0, 0.25 + (backY - 0.3) / 2, -hz), pale);
    m.add(box(2.52, 0.14, 0.08, 0, 1.3, -hz), TRACKSIDE.marshalOrange);
    for (const sx of [-1, 1]) m.add(box(0.05, 1.0, 1.2, sx * hx, 0.75, -0.35), white);
    // Bench along the back wall.
    m.add(box(2.2, 0.06, 0.42, 0, 0.72, -0.68), BUILDING.timber);
    m.add(box(2.1, 0.45, 0.05, 0, 0.47, -0.5), BUILDING.timber);
    flagBin(m, 0.8, 0.25, 0.55, 3);
    m.add(cylinder(0.08, 0.08, 0.3, 0.82, 5).translate(-hx + 0.15, 0, -hz + 0.18), BUILDING.accentRed);
    numberBoard(m, 0, frontY + 0.42, hz + 0.32, 1.1, 0.6);
    return { geometry: m.build(), radius: 1.6, height: frontY + 0.75 };
  }
  if (variant === 1) {
    // Raised platform: legs, timber deck, white balustrade with an orange top rail, roof, stairs.
    const deckY = 1.3;
    const [frontY, backY] = [deckY + 2.3, deckY + 2.1];
    posts(m, [-1, 1], [-0.8, 0.8], 0, frontY, backY, 0.8, -0.8);
    m.add(box(2.2, 0.08, 1.8, 0, deckY, 0), BUILDING.timber);
    m.add(box(2.2, 0.85, 0.04, 0, deckY + 0.48, 0.88), white);
    for (const sx of [-1, 1]) m.add(box(0.04, 0.85, 1.8, sx * 1.08, deckY + 0.48, 0), white);
    m.add(box(2.26, 0.08, 0.08, 0, deckY + 0.94, 0.88), TRACKSIDE.marshalOrange);
    m.add(skillionRoof(2.7, 2.3, frontY + 0.05, backY + 0.05, 0.08), white);
    numberBoard(m, 0, frontY + 0.38, 1.1, 1.0, 0.55);
    flagBin(m, -0.6, deckY + 0.04, 0.35, 2);
    for (let i = 0; i < 4; i++) m.add(box(0.8, 0.05, 0.3, 0.55, deckY * ((i + 1) / 5), -0.95 - (4 - i) * 0.28), BUILDING.timber);
    m.add(strut(V(0.97, 0.9, -2.2), V(0.97, deckY + 0.9, -0.9), 0.025, 4), white);
    return { geometry: m.build(), radius: 1.8, height: frontY + 0.7 };
  }
  // Roofed bench shelter on a slab: four posts, pale roof, back screen, bench, flag bin.
  const [frontY, backY] = [2.6, 2.4];
  m.add(box(3.0, 0.15, 2.2, 0, 0.075, 0), TRACKSIDE.concrete);
  posts(m, [-1.3, 1.3], [-0.9, 0.9], 0.15, frontY, backY, 0.9, -0.9);
  m.add(skillionRoof(3.1, 2.4, frontY + 0.05, backY + 0.05, 0.1), white);
  m.add(box(2.6, 1.0, 0.05, 0, 0.65, -0.9), pale);
  m.add(box(2.4, 0.06, 0.42, 0, 0.52, -0.62), BUILDING.timber);
  m.add(box(2.3, 0.35, 0.05, 0, 0.32, -0.45), BUILDING.timber);
  flagBin(m, 0.95, 0.15, 0.5, 3);
  m.add(cylinder(0.08, 0.08, 0.2, 0.72, 5).translate(-1.15, 0, -0.7), BUILDING.accentRed);
  numberBoard(m, 0, frontY + 0.4, 1.15, 1.1, 0.6);
  return { geometry: m.build(), radius: 1.7, height: frontY + 0.75 };
}

/** Portable toilet: moulded walls, white roof, door with vent and handle. */
export function buildPortaloo(variant: number): BuiltProp {
  const m = new Mesher();
  const walls = [BUILDING.accentBlue, BUILDING.colorbondGreen, BUILDING.grey, BUILDING.roofRed][variant];
  const w = 1.12;
  const d = 1.15;
  const h = 2.25;
  m.add(box(w + 0.06, 0.12, d + 0.06, 0, 0.06, 0), BUILDING.darkGrey);
  m.add(box(w, h - 0.12, d, 0, 0.12 + (h - 0.12) / 2, 0), walls, { jitter: 0.03 });
  // Domed roof: a low frustum with a vent stack.
  m.add(cylinder(0.78, 0.45, h, h + 0.18, 8, true, Math.PI / 8).scale(1, 1, 1), BUILDING.white);
  m.add(cylinder(0.06, 0.06, h + 0.1, h + 0.45, 6).translate(-0.35, 0, -0.35), BUILDING.white);
  // Door frame, vent louvres and the occupied/vacant latch.
  const z = d / 2 + 0.012;
  m.add(box(0.8, 1.95, 0.025, 0, 1.12, z), (f) => (f.normal.z > 0.9 ? new THREE.Color().setHex(walls).multiplyScalar(0.82) : walls));
  m.add(box(0.5, 0.18, 0.02, 0, 2.0, z + 0.012), BUILDING.white);
  m.add(box(0.06, 0.18, 0.05, 0.3, 1.1, z + 0.02), BUILDING.white);
  return { geometry: m.build(), radius: 0.8, height: h + 0.45 };
}
