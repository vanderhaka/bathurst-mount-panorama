import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { cylinder } from '@/props/core/prims';
import { box, loftRings, place, strut, tube } from '@/props/core/shapes';
import type { BuiltProp } from '@/props/kinds-types';

// Light poles, flag poles / feather banners and the TV camera scaffold tower.

export const POLE_VARIANTS = { lightPole: 3, flagPole: 4, tvCameraTower: 3 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Street light, floodlight tower or twin car-park light. Lamps face +Z. */
export function buildLightPole(variant: number): BuiltProp {
  const m = new Mesher();
  const steel = TRACKSIDE.fencePost;
  const lens = BUILDING.white;
  if (variant === 0) {
    m.add(cylinder(0.1, 0.055, 0, 8, 8), steel, { jitter: 0.03 });
    m.add(tube([V(0, 7.8, 0), V(0, 8.3, 0.4), V(0, 8.45, 1.4), V(0, 8.4, 1.9)], [0.05, 0.045, 0.04, 0.035], 5), steel);
    const head = box(0.32, 0.12, 0.7, 0, 8.36, 2.0);
    m.add(head, (f) => (f.normal.y < -0.9 ? lens : BUILDING.grey));
    m.add(box(0.3, 0.3, 0.3, 0, 0.15, 0), TRACKSIDE.concrete);
    return { geometry: m.build(), radius: 1.0, height: 8.5 };
  }
  if (variant === 1) {
    m.add(cylinder(0.2, 0.11, 0, 15, 8), steel, { jitter: 0.03 });
    m.add(box(2.6, 0.1, 0.1, 0, 15.0, 0.12), steel);
    m.add(box(2.6, 0.1, 0.1, 0, 15.9, 0.12), steel);
    for (let i = 0; i < 4; i++) {
      const x = -0.95 + i * 0.63;
      for (const y of [15.45, 16.35]) {
        const lamp = box(0.5, 0.42, 0.22, 0, 0, 0);
        place(lamp, x, y, 0.3, 0.35);
        m.add(lamp, (f) => (f.normal.z > 0.8 ? lens : BUILDING.darkGrey));
      }
    }
    m.add(box(0.6, 0.4, 0.6, 0, 0.2, 0), TRACKSIDE.concrete);
    return { geometry: m.build(), radius: 1.4, height: 16.6 };
  }
  m.add(cylinder(0.12, 0.07, 0, 10, 8), steel, { jitter: 0.03 });
  for (const s of [-1, 1]) {
    m.add(tube([V(0, 9.7, 0), V(s * 0.6, 10.05, 0), V(s * 1.3, 10.1, 0)], 0.04, 5), steel);
    m.add(box(0.7, 0.12, 0.34, s * 1.5, 10.06, 0), (f) => (f.normal.y < -0.9 ? lens : BUILDING.grey));
  }
  m.add(box(0.36, 0.3, 0.36, 0, 0.15, 0), TRACKSIDE.concrete);
  return { geometry: m.build(), radius: 1.9, height: 10.2 };
}

/** Rippled cloth panel hanging from x = 0 towards +X (double-sided). */
function cloth(width: number, height: number, top: number, cols: number, rows: number, amp: number, phase: number, outline?: (u: number) => [number, number]): THREE.BufferGeometry {
  const grid: THREE.Vector3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: THREE.Vector3[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const [lo, hi] = outline ? outline(u) : [0, 1];
      const v = lo + (hi - lo) * (r / rows);
      row.push(V(u * width, top - (1 - v) * height, Math.sin(u * Math.PI * 1.6 + phase + v * 0.6) * amp * (0.3 + u)));
    }
    grid.push(row);
  }
  const out: number[] = [];
  const push = (...ps: THREE.Vector3[]) => ps.forEach((p) => out.push(p.x, p.y, p.z));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = grid[r][c];
      const b = grid[r][c + 1];
      const d = grid[r + 1][c];
      const e = grid[r + 1][c + 1];
      push(a, b, e, a, e, d); // front (+Z)
      push(a, e, b, a, d, e); // back
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/** Flag pole (variants 0-1) or event feather banner (2-3). The cloth is white and takes the instance colour. */
export function buildFlagPole(variant: number): BuiltProp {
  const m = new Mesher(true);
  const steel = TRACKSIDE.armco;
  if (variant <= 1) {
    const h = variant === 0 ? 8 : 6;
    const fw = variant === 0 ? 1.8 : 1.5;
    m.add(cylinder(0.05, 0.03, 0, h, 7), steel, { jitter: 0.03 });
    m.add(cylinder(0.06, 0.0, h, h + 0.12, 6), BUILDING.white);
    m.add(cloth(fw, fw / 2, h - 0.1, 5, 2, 0.12, variant).translate(0.04, 0, 0), 0xffffff, { tint: true });
    m.add(box(0.3, 0.12, 0.3, 0, 0.06, 0), TRACKSIDE.concrete);
    return { geometry: m.build(), radius: fw, height: h + 0.12 };
  }
  // Feather / teardrop banner: a bent flexible pole with the cloth sewn along it.
  const h = variant === 2 ? 3.4 : 4.4;
  const w = variant === 2 ? 0.85 : 0.7;
  const pole = [V(0, 0, 0), V(0, h * 0.5, 0), V(0.12, h * 0.85, 0), V(0.45, h, 0)];
  m.add(tube(pole, [0.02, 0.018, 0.015, 0.012], 4), BUILDING.darkGrey);
  const outline = variant === 2 ? (u: number): [number, number] => [0.22 + 0.18 * u * u, 1 - 0.25 * u * u] : (u: number): [number, number] => [0.12, 1 - 0.18 * u * u * u];
  const banner = cloth(w, h, h, 4, 4, 0.05, 0.4, outline);
  // Rotate the banner so it hangs from the pole (pole along +Y, cloth towards +X).
  m.add(banner.translate(0.02, 0, 0), 0xffffff, { tint: true });
  m.add(loftRings([[V(-0.25, 0, -0.25), V(0.25, 0, -0.25), V(0.25, 0, 0.25), V(-0.25, 0, 0.25)], [V(-0.08, 0.06, -0.08), V(0.08, 0.06, -0.08), V(0.08, 0.06, 0.08), V(-0.08, 0.06, 0.08)]].map((r) => r.reverse()), { capEnd: true }), BUILDING.darkGrey);
  return { geometry: m.build(), radius: w, height: h };
}

/** Scaffold camera tower: tube frame, decked platform with handrails, camera on a tripod, shade canopy. */
export function buildTvCameraTower(variant: number): BuiltProp {
  const deck = [5.5, 3.2, 8.0][variant];
  const m = new Mesher();
  const tubeC = TRACKSIDE.armco;
  const s = 1.0;
  const corners = [V(-s, 0, -s), V(s, 0, -s), V(s, 0, s), V(-s, 0, s)];
  const top = deck + 1.05;
  for (const c of corners) m.add(strut(c, c.clone().setY(top), 0.03, 4), tubeC);
  const lifts = Math.max(2, Math.round(deck / 2));
  for (let l = 1; l <= lifts; l++) {
    const y = (deck * l) / lifts;
    for (let i = 0; i < 4; i++) {
      const a = corners[i].clone().setY(y);
      const b = corners[(i + 1) % 4].clone().setY(y);
      m.add(strut(a, b, 0.025, 4), tubeC);
      const lo = (deck * (l - 1)) / lifts;
      if ((i + l) % 2 === 0) m.add(strut(corners[i].clone().setY(lo), b, 0.022, 4), tubeC);
    }
  }
  // Deck and toe boards, handrail.
  m.add(box(2.2, 0.06, 2.2, 0, deck + 0.03, 0), BUILDING.timber);
  for (let i = 0; i < 4; i++) {
    const a = corners[i].clone().setY(top);
    const b = corners[(i + 1) % 4].clone().setY(top);
    m.add(strut(a, b, 0.025, 4), tubeC);
  }
  m.add(box(2.04, 0.18, 0.02, 0, deck + 0.15, s), TRACKSIDE.marshalOrange);
  // Camera on tripod, pointing at the track (+Z).
  const cy = deck + 1.35;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    m.add(strut(V(Math.cos(a) * 0.35, deck + 0.06, Math.sin(a) * 0.35 - 0.2), V(0, cy - 0.12, -0.2), 0.015, 3), BUILDING.darkGrey);
  }
  m.add(box(0.26, 0.3, 0.55, 0, cy + 0.04, -0.15), BUILDING.darkGrey);
  m.add(cylinder(0.09, 0.075, 0, 0.42, 8).rotateX(Math.PI / 2).translate(0, cy + 0.06, 0.12), TRACKSIDE.tyre);
  m.add(box(0.16, 0.12, 0.1, -0.15, cy + 0.12, -0.42), BUILDING.grey);
  // Shade canopy on a corner pole.
  const roofY = top + 1.4;
  m.add(strut(V(-s, top, -s), V(-s, roofY, -s), 0.03, 4), tubeC);
  m.add(strut(V(s, top, -s), V(s, roofY - 0.25, -s), 0.03, 4), tubeC);
  const canopy = loftRings([
    [V(-1.3, roofY - 0.35, 1.2), V(1.3, roofY - 0.45, 1.2), V(1.3, roofY - 0.25, -1.3), V(-1.3, roofY, -1.3)],
    [V(-1.3, roofY - 0.3, 1.2), V(1.3, roofY - 0.4, 1.2), V(1.3, roofY - 0.2, -1.3), V(-1.3, roofY + 0.05, -1.3)],
  ], { capStart: true, capEnd: true });
  m.add(canopy, BUILDING.offWhite);
  // Base plates.
  for (const c of corners) m.add(box(0.2, 0.04, 0.2, c.x, 0.02, c.z), BUILDING.timber);
  return { geometry: m.build(), radius: 1.6, height: roofY + 0.1 };
}
