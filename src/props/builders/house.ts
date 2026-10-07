import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { gableRoof, hipRoof, skillionRoof } from '@/props/core/prims';
import { box, quad } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';

// Australian bungalows: 70s brick veneer (hip roof), weatherboard cottage with a
// front verandah, 50s fibro (gable), and a modern rendered house (skillion).
// Front (+Z) faces the road.

export const HOUSE_VARIANTS = { house: 4 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Window on a wall facing +Z (rotated by `ry` for other walls): white frame + dark glass. */
function windowAt(m: Mesher, x: number, y: number, z: number, w: number, h: number, ry = 0): void {
  const frame = box(w + 0.1, h + 0.1, 0.06, 0, 0, 0).rotateY(ry).translate(x, y, z);
  m.add(frame, BUILDING.white);
  const n = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  const t = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
  const c = new THREE.Vector3(x, y, z).addScaledVector(n, 0.035);
  const p = (u: number, v: number) => c.clone().addScaledVector(t, u).add(new THREE.Vector3(0, v, 0));
  m.add(quad(p(-w / 2, -h / 2), p(w / 2, -h / 2), p(w / 2, h / 2), p(-w / 2, h / 2)), PROPS_LOOK.vehicles.glass);
}

export function buildHouse(variant: number): BuiltProp {
  const m = new Mesher();
  const look = PROPS_LOOK.buildings;
  const roofCol = look.roofs[variant % look.roofs.length];
  if (variant === 0) {
    // Brick veneer, hip roof, wide eaves, brick chimney, garage door.
    const [w, d, h] = [14, 10, 2.7];
    m.add(box(w, 0.35, d, 0, 0.175, 0), BUILDING.brick);
    m.add(box(w - 0.1, h, d - 0.1, 0, 0.35 + h / 2, 0), BUILDING.brick, { jitter: 0.03 });
    m.add(hipRoof(w + 1.2, d + 1.2, h + 0.35, 2.4), look.roofs[1], { jitter: 0.02 });
    m.add(box(0.8, 1.6, 0.8, 3.5, h + 2.2, -1.5), BUILDING.brick);
    for (const x of [-4.8, -1.6]) windowAt(m, x, 1.8, d / 2, 1.8, 1.3);
    m.add(box(3.0, 2.2, 0.08, 4.3, 1.45, d / 2 + 0.02), BUILDING.offWhite);
    m.add(box(1.0, 2.1, 0.08, 1.2, 1.4, d / 2 + 0.02), BUILDING.timber);
    for (const z of [-2.5, 2]) windowAt(m, w / 2, 1.8, z, 1.5, 1.2, Math.PI / 2);
    m.add(box(4, 0.1, 4, 4.3, 0.05, d / 2 + 2), TRACKSIDE.concrete);
    return { geometry: m.build(), radius: Math.hypot(w + 1.2, d + 5) / 2 };
  }
  if (variant === 1) {
    // Weatherboard cottage on stumps, gable roof, full-width verandah.
    const [w, d, h] = [11, 9, 3.0];
    const boards = look.weatherboard[1];
    m.add(box(w, 0.6, d, 0, 0.3, 0), BUILDING.darkGrey);
    m.add(box(w - 0.1, h, d - 0.1, 0, 0.6 + h / 2, 0), (f) => (Math.abs(f.normal.y) > 0.5 ? boards : new THREE.Color().setHex(boards).multiplyScalar(0.93 + 0.07 * Math.sin(f.centroid.y * 18))), { jitter: 0.02 });
    m.add(gableRoof(w + 0.6, d + 0.8, h + 0.6, 2.6, 0.08), roofCol);
    m.add(skillionRoof(w, 2.6, h + 0.2, h + 0.55, 0.06, 0, d / 2 + 1.3), roofCol);
    m.add(box(w, 0.12, 2.6, 0, 0.55, d / 2 + 1.3), BUILDING.timber);
    for (let i = 0; i <= 5; i++) m.add(box(0.12, h - 0.4, 0.12, -w / 2 + 0.2 + (i * (w - 0.4)) / 5, 0.6 + (h - 0.4) / 2, d / 2 + 2.5), BUILDING.white);
    m.add(box(w, 0.06, 0.06, 0, 1.5, d / 2 + 2.5), BUILDING.white);
    for (const x of [-3.2, 3.2]) windowAt(m, x, 2.0, d / 2, 1.2, 1.6);
    m.add(box(1.0, 2.1, 0.08, 0, 1.65, d / 2 + 0.02), BUILDING.accentRed);
    m.add(box(0.7, 1.2, 0.7, -2.8, h + 2.6, -1.8), BUILDING.brick);
    for (const z of [-2.5, 1.5]) windowAt(m, w / 2, 2.0, z, 1.0, 1.5, Math.PI / 2);
    return { geometry: m.build(), radius: Math.hypot(w, d + 5) / 2 };
  }
  if (variant === 2) {
    // 50s fibro: pale walls, gable roof, front porch with a small awning.
    const [w, d, h] = [12, 8.5, 2.8];
    const wall = look.weatherboard[3 % look.weatherboard.length];
    m.add(box(w, 0.45, d, 0, 0.225, 0), BUILDING.grey);
    m.add(box(w - 0.1, h, d - 0.1, 0, 0.45 + h / 2, 0), wall, { jitter: 0.02 });
    m.add(gableRoof(w + 0.8, d + 0.9, h + 0.45, 2.0, 0.08), roofCol);
    m.add(skillionRoof(3, 1.6, h - 0.1, h + 0.2, 0.06, -1.5, d / 2 + 0.8), roofCol);
    m.add(box(3, 0.3, 1.6, -1.5, 0.15, d / 2 + 0.8), TRACKSIDE.concrete);
    windowAt(m, -4.0, 1.9, d / 2, 2.2, 1.3);
    windowAt(m, 2.8, 1.9, d / 2, 2.2, 1.3);
    m.add(box(0.9, 2.05, 0.08, -1.5, 1.5, d / 2 + 0.02), BUILDING.colorbondGreen);
    windowAt(m, -w / 2, 1.9, 0, 1.2, 1.2, -Math.PI / 2);
    return { geometry: m.build(), radius: Math.hypot(w, d + 3) / 2 };
  }
  // Modern: rendered walls, dark skillion roof, big glazing, carport.
  const [w, d, h] = [13, 10, 3.0];
  m.add(box(w, 0.3, d, 0, 0.15, 0), TRACKSIDE.concrete);
  m.add(box(w - 0.1, h, d - 0.1, 0, 0.3 + h / 2, 0), look.walls[1], { jitter: 0.015 });
  m.add(skillionRoof(w + 0.9, d + 0.9, h + 1.0, h + 0.3, 0.12), BUILDING.darkGrey);
  windowAt(m, -3.0, 1.75, d / 2, 4.0, 2.1);
  windowAt(m, 2.5, 2.0, d / 2, 1.4, 1.2);
  m.add(box(1.1, 2.3, 0.08, 0.6, 1.45, d / 2 + 0.02), BUILDING.timber);
  // Carport on posts at the +X end.
  m.add(skillionRoof(3.4, 6, 2.7, 2.6, 0.08, w / 2 + 1.7, 1), BUILDING.darkGrey);
  for (const z of [-1.8, 3.8]) m.add(box(0.1, 2.6, 0.1, w / 2 + 3.3, 1.3, z), BUILDING.darkGrey);
  m.add(quad(V(w / 2, 0.02, 4), V(w / 2 + 3.4, 0.02, 4), V(w / 2 + 3.4, 0.02, -2), V(w / 2, 0.02, -2)), TRACKSIDE.concrete);
  return { geometry: m.build(), radius: Math.hypot(w + 7, d + 1) / 2 };
}
