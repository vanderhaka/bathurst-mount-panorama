import * as THREE from 'three';
import { BUILDING, GROUND, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { corrugatedCylinder, cylinder, gableRoof } from '@/props/core/prims';
import { box, lathe, loftRings, strut } from '@/props/core/shapes';
import type { BuiltProp } from '@/props/kinds-types';

// Rural buildings: corrugated rainwater tanks and sheds.

export const RURAL_VARIANTS = { waterTank: 4, shed: 3 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Rainwater tank: corrugated wall, shallow cone roof with a strainer, tap. */
export function buildWaterTank(variant: number): BuiltProp {
  const m = new Mesher();
  const [r, h, colour, base] = [
    [1.2, 2.0, TRACKSIDE.armco, 0],
    [1.6, 2.3, BUILDING.colorbondGreen, 0],
    [1.35, 2.1, GROUND.sand, 0],
    [0.7, 1.8, TRACKSIDE.armco, 1.5],
  ][variant] as [number, number, number, number];
  const sides = r > 1 ? 14 : 12;
  if (variant === 2) {
    // Moulded poly tank: smooth wall with three raised bands.
    m.add(lathe([[r, 0], [r, 0.55], [r + 0.04, 0.6], [r, 0.65], [r, 1.35], [r + 0.04, 1.4], [r, 1.45], [r, h]], sides), colour, { jitter: 0.02 });
  } else {
    m.add(corrugatedCylinder(r, h, sides, 7, 0.035).translate(0, base, 0), colour, { jitter: 0.025 });
  }
  m.add(lathe([[r + 0.03, base + h], [r * 0.25, base + h + r * 0.22], [0.25, base + h + r * 0.24]], sides, { capEnd: true }), colour, { jitter: 0.02 });
  m.add(cylinder(0.22, 0.22, base + h + r * 0.22, base + h + r * 0.22 + 0.12, 8), BUILDING.darkGrey);
  m.add(box(0.06, 0.06, 0.2, 0, base + 0.25, r + 0.08), TRACKSIDE.fencePost);
  if (base > 0) {
    // Timber stand.
    for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) m.add(box(0.12, base, 0.12, x, base / 2, z), BUILDING.timber);
    m.add(box(1.6, 0.1, 1.6, 0, base - 0.05, 0), BUILDING.timber);
  } else {
    m.add(cylinder(r + 0.15, r + 0.15, 0, 0.06, sides), TRACKSIDE.concrete);
  }
  return { geometry: m.build(), radius: r + 0.2 };
}

/** Garden shed, open-fronted machinery shed, or barrel-roofed hay shed. */
export function buildShed(variant: number): BuiltProp {
  const m = new Mesher();
  if (variant === 0) {
    const [w, d, h] = [3.0, 2.3, 2.0];
    m.add(box(w, h, d, 0, h / 2, 0), (f) => (f.normal.z > 0.9 && Math.abs(f.centroid.x) < 0.75 && f.centroid.y < 1.8 ? BUILDING.offWhite : BUILDING.colorbondGreen), { jitter: 0.02 });
    m.add(gableRoof(w + 0.2, d + 0.2, h, 0.45, 0.06), BUILDING.colorbondGreen);
    m.add(box(1.6, 1.85, 0.03, 0, 0.925, d / 2 + 0.01), BUILDING.offWhite);
    return { geometry: m.build(), radius: 2 };
  }
  if (variant === 1) {
    // Machinery shed: closed back and ends, three open bays to the front.
    const [w, d, h] = [12, 7, 4.2];
    const steel = TRACKSIDE.armco;
    m.add(box(w, h, 0.1, 0, h / 2, -d / 2), steel, { jitter: 0.02 });
    for (const s of [-1, 1]) m.add(box(0.1, h, d, s * (w / 2), h / 2, 0), steel, { jitter: 0.02 });
    for (const x of [-w / 6, w / 6]) m.add(box(0.15, h, 0.15, x, h / 2, d / 2 - 0.1), BUILDING.grey);
    m.add(box(w, 0.3, 0.15, 0, h - 0.15, d / 2 - 0.1), BUILDING.grey);
    m.add(gableRoof(w + 0.4, d + 0.6, h, 1.4, 0.08), steel);
    m.add(box(w, 0.08, d, 0, 0.04, 0), TRACKSIDE.concrete);
    return { geometry: m.build(), radius: Math.hypot(w, d) / 2 };
  }
  // Hay shed: pole frame and a curved (barrel) roof.
  const [w, d, h] = [10, 8, 5];
  for (const x of [-w / 2, -w / 6, w / 6, w / 2]) for (const z of [-d / 2, d / 2]) m.add(strut(V(x, 0, z), V(x, h, z), 0.11, 6, false, 0), BUILDING.timber);
  const arc = Array.from({ length: 7 }, (_, i) => {
    const t = (i / 6) * Math.PI;
    return [Math.cos(t) * (d / 2 + 0.3), h + Math.sin(t) * 1.6] as const;
  });
  const ringAt = (x: number, off: number) => arc.map(([z, y]) => V(x, y + off, z));
  // The arc runs clockwise about +X, so the outer skin is lofted towards -X.
  const outer = loftRings([ringAt(w / 2 + 0.3, 0), ringAt(-w / 2 - 0.3, 0)], { closed: false });
  const inner = loftRings([ringAt(-w / 2 - 0.3, -0.05), ringAt(w / 2 + 0.3, -0.05)], { closed: false });
  m.add(outer, TRACKSIDE.armco, { jitter: 0.02 });
  m.add(inner, BUILDING.grey);
  // A few round hay bales stacked inside.
  for (const [x, z, y] of [[-2.5, -1.5, 0.75], [-1.0, -1.5, 0.75], [-1.75, -1.5, 2.2], [2, 1, 0.75]]) {
    m.add(cylinder(0.75, 0.75, -0.6, 0.6, 10).rotateX(Math.PI / 2).translate(x, y, z), GROUND.grassDry, { jitter: 0.05 });
  }
  return { geometry: m.build(), radius: Math.hypot(w, d) / 2 + 0.4 };
}
