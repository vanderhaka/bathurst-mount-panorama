import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { quad } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import { StructureParts, V } from '@/props/structures/parts';

// Pit building: a long two-level complex along X facing the pit lane (+Z).
// Ground floor: garages with recessed roller doors between white piers.
// Upper floor: corporate suites with floor-to-ceiling glass and open balconies.
// Roof: thin slab with a deep overhang on slim columns, plant boxes on top, a
// signage band along the pit-lane edge and, near the -X (start/finish) end, the
// race-control room cantilevered out over the pit lane.

const DEPTH = 20;
const GROUND_H = 4.6;
const UPPER_H = 4.0;

export function buildPitBuilding(opts: { length: number; garages: number }): THREE.Group {
  const L = Math.max(20, opts.length);
  const n = Math.max(1, Math.round(opts.garages));
  const bay = L / n;
  const p = new StructureParts();
  const z0 = DEPTH / 2;
  const upperY = GROUND_H + 0.4;
  const roofY = upperY + UPPER_H;

  // Main volume (slightly set back so the façade elements sit in front of it).
  p.block(L, GROUND_H, DEPTH - 1.2, 0, 0, -0.6, BUILDING.white, 0.01);
  p.block(L, 0.4, DEPTH + 2.6, 0, GROUND_H, 1.3, BUILDING.offWhite);
  p.block(L, UPPER_H, DEPTH - 0.5, 0, upperY, -0.25, BUILDING.white, 0.01);
  p.block(L + 0.6, 0.15, DEPTH, 0, -0.02, 0, TRACKSIDE.concrete);

  // Garage piers and roller doors.
  const pier = 0.7;
  for (let i = 0; i <= n; i++) {
    const x = -L / 2 + i * bay;
    p.block(i === 0 || i === n ? pier * 1.4 : pier, GROUND_H, 0.6, x, 0, z0 - 0.5, BUILDING.offWhite);
  }
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + (i + 0.5) * bay;
    const dw = bay - pier - 0.3;
    p.block(dw, 3.6, 0.1, x, 0, z0 - 0.75, BUILDING.grey);
    // Door slats and the blank garage-number board above the door.
    for (const y of [0.9, 1.8, 2.7]) p.block(dw, 0.05, 0.02, x, y, z0 - 0.69, BUILDING.darkGrey);
    p.block(dw, 0.75, 0.12, x, 3.75, z0 - 0.66, BUILDING.white);
    p.block(Math.min(1.6, dw * 0.4), 0.45, 0.02, x, 3.9, z0 - 0.59, BUILDING.darkGrey);
  }

  // Balcony: slab edge, glass balustrade and its top rail.
  const balZ = z0 + 1.3 + 1.3;
  p.glass.add(quad(V(-L / 2, upperY, balZ), V(L / 2, upperY, balZ), V(L / 2, upperY + 1.05, balZ), V(-L / 2, upperY + 1.05, balZ), true), new THREE.Color().setHex(BUILDING.glassLight).lerp(new THREE.Color().setHex(BUILDING.white), 0.35));
  p.beam(V(-L / 2, upperY + 1.08, balZ), V(L / 2, upperY + 1.08, balZ), 0.035, TRACKSIDE.armco);

  // Suite glazing with mullions every ~2.5 m and a suite divider wall every bay.
  const glassZ = z0 - 0.5 + 0.02;
  const suiteGlass = new THREE.Color().setHex(BUILDING.glass).lerp(new THREE.Color().setHex(BUILDING.glassLight), 0.3);
  p.glass.add(quad(V(-L / 2, upperY, glassZ), V(L / 2, upperY, glassZ), V(L / 2, roofY, glassZ), V(-L / 2, roofY, glassZ)), suiteGlass);
  const mullions = Math.round(L / 2.5);
  for (let i = 0; i <= mullions; i++) p.block(0.12, UPPER_H, 0.15, -L / 2 + (i * L) / mullions, upperY, glassZ + 0.07, BUILDING.darkGrey);
  for (let i = 0; i <= n; i += 2) p.block(0.25, UPPER_H, 1.2, -L / 2 + i * bay, upperY, glassZ + 0.6, BUILDING.grey);
  // Office windows along the back (paddock) face of the upper level.
  const backZ = -DEPTH / 2 - 0.04;
  for (let x = -L / 2 + 2; x < L / 2 - 2; x += 3.2) p.glass.add(quad(V(x + 2, upperY + 0.9, backZ), V(x, upperY + 0.9, backZ), V(x, roofY - 0.5, backZ), V(x + 2, roofY - 0.5, backZ)), BUILDING.glass);

  // Roof slab with a deep overhang, fascia band and slim columns.
  const roofD = DEPTH + 4.5;
  p.block(L + 2, 0.35, roofD, 0, roofY, (roofD - DEPTH) / 2 + 0.5, BUILDING.white);
  const roofEdgeZ = z0 + (roofD - DEPTH) + 0.5;
  p.block(L + 2.05, 0.7, 0.2, 0, roofY - 0.15, roofEdgeZ, BUILDING.darkGrey);
  const rc = addRaceControl(p, L, roofY + 0.35, roofEdgeZ);
  addSignageBand(p, L, roofY + 0.35, roofEdgeZ + 0.12, rc);
  for (let i = 0; i <= n; i += 2) {
    const x = -L / 2 + i * bay;
    p.beam(V(x, upperY, balZ - 0.35), V(x, roofY, balZ - 0.35), 0.12, BUILDING.grey, 6);
  }
  // Roof-top plant boxes and the parapet.
  for (let x = -L / 2 + 8; x < L / 2 - 4; x += 22) p.block(6, 1.4, 4, x, roofY + 0.35, -4, BUILDING.grey);
  p.block(L, 0.6, 0.25, 0, roofY + 0.35, -DEPTH / 2 + 0.2, BUILDING.offWhite);

  // End walls with stair cores.
  for (const s of [-1, 1]) {
    p.block(4, roofY + 1.2, 6, s * (L / 2 + 2), 0, -DEPTH / 2 + 3.5, BUILDING.offWhite, 0.01);
    p.glass.add(quad(V(s * (L / 2 + 4) + 0.01 * s, 1, -DEPTH / 2 + 1.5), V(s * (L / 2 + 4) + 0.01 * s, 1, -DEPTH / 2 + 5.5), V(s * (L / 2 + 4) + 0.01 * s, roofY, -DEPTH / 2 + 5.5), V(s * (L / 2 + 4) + 0.01 * s, roofY, -DEPTH / 2 + 1.5), true), BUILDING.glass);
  }
  return p.toGroup('pit-building');
}

/** X range taken by the race-control room (the signage band runs around it). */
interface Span {
  x0: number;
  x1: number;
}

/**
 * Race control: a glazed room on the roof near the -X end, projecting ~6 m past the
 * roof edge over the pit lane. White floor slab and roof, dark outward-raked glass
 * with white mullions, a white soffit and two raking steel struts under the overhang.
 */
function addRaceControl(p: StructureParts, L: number, y0: number, roofEdgeZ: number): Span {
  const w = Math.min(26, L * 0.16);
  const cx = -L / 2 + Math.max(w / 2 + 4, L * 0.12);
  const zBack = roofEdgeZ - 9;
  const zFront = roofEdgeZ + 6;
  const h = 3.4;
  const rake = 0.9;
  // Floor slab (deep white edge) and roof slab with a projecting white frame.
  p.block(w + 0.6, 0.7, zFront - zBack + 0.4, cx, y0, (zFront + zBack) / 2, BUILDING.white);
  p.block(w + 2.2, 0.45, zFront - zBack + rake + 1.4, cx, y0 + 0.7 + h, (zFront + zBack + rake + 0.6) / 2, BUILDING.white);
  p.block(w + 2.25, 0.18, 0.2, cx, y0 + 0.7 + h - 0.1, zFront + rake + 1.2, BUILDING.accentRed);
  // Raked glass: front and the two side returns (dark glass, faces outwards).
  const yb = y0 + 0.7;
  const yt = yb + h;
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const zg = zFront - 2.2;
  const front = [V(x0, yb, zFront), V(x1, yb, zFront), V(x1, yt, zFront + rake), V(x0, yt, zFront + rake)];
  p.glass.add(quad(front[0], front[1], front[2], front[3]), BUILDING.glass);
  p.glass.add(quad(V(x1, yb, zFront), V(x1, yb, zg), V(x1, yt, zg), V(x1, yt, zFront + rake)), BUILDING.glass);
  p.glass.add(quad(V(x0, yb, zg), V(x0, yb, zFront), V(x0, yt, zFront + rake), V(x0, yt, zg)), BUILDING.glass);
  // Solid white walls behind the glazed bay.
  p.block(w, h, zg - zBack, cx, yb, (zg + zBack) / 2, BUILDING.offWhite, 0.01);
  // White mullions on the front and the corners.
  const bays = Math.max(4, Math.round(w / 2.2));
  for (let i = 0; i <= bays; i++) {
    const x = x0 + (w * i) / bays;
    p.beam(V(x, yb, zFront + 0.05), V(x, yt, zFront + rake + 0.05), 0.07, BUILDING.white);
  }
  for (const x of [x0, x1]) p.beam(V(x, yb, zg), V(x, yt, zg), 0.07, BUILDING.white);
  p.beam(V(x0, yb + 1.0, zFront + 0.3), V(x1, yb + 1.0, zFront + 0.3), 0.05, BUILDING.white);
  // Raking struts under the cantilever, back to the roof edge.
  for (const x of [x0 + 1.5, x1 - 1.5]) p.beam(V(x, y0 - 0.9, roofEdgeZ - 0.3), V(x, y0 + 0.05, zFront - 0.6), 0.12, BUILDING.grey, 6);
  return { x0: cx - w / 2 - 1.1, x1: cx + w / 2 + 1.1 };
}

/**
 * Signage band along the pit-lane edge of the roof: a row of plain sponsor panels
 * (white / red / dark, each with a contrasting abstract stripe and block), no text.
 */
function addSignageBand(p: StructureParts, L: number, y0: number, z: number, skip: Span): void {
  const look = PROPS_LOOK.pitBuilding;
  const h = 1.7;
  const panelW = 11;
  // Backing frame along the whole run, then the panels in front of it.
  p.block(L + 2, h + 0.2, 0.15, 0, y0, z - 0.1, BUILDING.darkGrey);
  let k = 0;
  for (let x = -L / 2 - 1 + 0.15; x + panelW * 0.5 < L / 2 + 1; x += panelW) {
    const xa = x;
    const xb = Math.min(L / 2 + 1 - 0.15, x + panelW - 0.25);
    if (xb > skip.x0 && xa < skip.x1) continue;
    const cx = (xa + xb) / 2;
    const w = xb - xa;
    const c = look.signage[k % look.signage.length];
    const stripe = look.signageStripe[k % look.signageStripe.length];
    p.block(w, h - 0.1, 0.06, cx, y0 + 0.15, z + 0.02, c);
    // Abstract mark: a long stripe plus a square block, placed differently per panel.
    const left = k % 2 === 0;
    p.block(w * 0.58, 0.32, 0.07, cx + (left ? w * 0.14 : -w * 0.14), y0 + 0.15 + (k % 3 === 0 ? 0.35 : 0.95), z + 0.04, stripe);
    p.block(1.1, 1.1, 0.07, cx + (left ? -w * 0.33 : w * 0.33), y0 + 0.4, z + 0.04, stripe);
    k++;
  }
}
