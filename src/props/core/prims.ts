import * as THREE from 'three';
import { lathe, loftRings } from '@/props/core/shapes';

// Small architectural / mechanical primitives used by the prop builders.
// Organic forms use lofts (shapes.ts); these are for man-made parts.

/** Vertical cylinder / frustum from y0 to y1 (n sides), optionally capped. */
export function cylinder(r0: number, r1: number, y0: number, y1: number, sides: number, caps = true, phase = 0): THREE.BufferGeometry {
  return lathe([[r0, y0], [r1, y1]], sides, { capStart: caps, capEnd: caps, phase });
}

/** Cylinder with its axis along X (wheels, rolls), centred at (x, y, z). */
export function cylinderX(radius: number, width: number, sides: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = cylinder(radius, radius, -width / 2, width / 2, sides, true, Math.PI / sides);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/** Cylinder with its axis along Z, centred at (x, y, z). */
export function cylinderZ(radius: number, length: number, sides: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = cylinder(radius, radius, -length / 2, length / 2, sides, true, Math.PI / sides);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/**
 * Gable roof prism: ridge along X, eaves at y = eaveY, ridge at y = eaveY + rise.
 * `w` along X and `d` along Z include the overhang. Returns the two roof planes + gable ends.
 */
export function gableRoof(w: number, d: number, eaveY: number, rise: number, thickness = 0.12, cx = 0, cz = 0): THREE.BufferGeometry {
  const hx = w / 2;
  const hz = d / 2;
  const t = thickness;
  const ring = (x: number) => [
    new THREE.Vector3(x, eaveY - t, cz + hz),
    new THREE.Vector3(x, eaveY, cz + hz),
    new THREE.Vector3(x, eaveY + rise, cz),
    new THREE.Vector3(x, eaveY, cz - hz),
    new THREE.Vector3(x, eaveY - t, cz - hz),
    new THREE.Vector3(x, eaveY + rise - t * 1.4, cz),
  ].reverse(); // counter-clockwise about +X so faces point outwards
  return loftRings([ring(cx - hx), ring(cx + hx)], { capStart: true, capEnd: true });
}

/** Hip roof: rectangular eave outline rising to a ridge (or a point when w == d). */
export function hipRoof(w: number, d: number, eaveY: number, rise: number, cx = 0, cz = 0): THREE.BufferGeometry {
  const hx = w / 2;
  const hz = d / 2;
  const ridge = Math.max(0, hx - hz);
  const e = [
    new THREE.Vector3(cx - hx, eaveY, cz + hz),
    new THREE.Vector3(cx + hx, eaveY, cz + hz),
    new THREE.Vector3(cx + hx, eaveY, cz - hz),
    new THREE.Vector3(cx - hx, eaveY, cz - hz),
  ];
  const r0 = new THREE.Vector3(cx - ridge, eaveY + rise, cz);
  const r1 = new THREE.Vector3(cx + ridge, eaveY + rise, cz);
  const tris = [e[0], e[1], r1, e[0], r1, r0, e[1], e[2], r1, e[2], e[3], r0, e[2], r0, r1, e[3], e[0], r0];
  // Underside (soffit) so the roof is not see-through from below.
  tris.push(e[0], e[2], e[1], e[0], e[3], e[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p.x, p.y, p.z]), 3));
  return g;
}

/** Skillion (mono-pitch) roof slab, high edge at the back (-Z). */
export function skillionRoof(w: number, d: number, frontY: number, backY: number, thickness = 0.1, cx = 0, cz = 0): THREE.BufferGeometry {
  const hx = w / 2;
  const hz = d / 2;
  const ring = (x: number) => [
    new THREE.Vector3(x, frontY - thickness, cz + hz),
    new THREE.Vector3(x, frontY, cz + hz),
    new THREE.Vector3(x, backY, cz - hz),
    new THREE.Vector3(x, backY - thickness, cz - hz),
  ].reverse();
  return loftRings([ring(cx - hx), ring(cx + hx)], { capStart: true, capEnd: true });
}

/** Clamps every vertex below `y` up to `y` (flattens shapes that sink into the ground). */
export function clampBelow(g: THREE.BufferGeometry, y = 0): THREE.BufferGeometry {
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < y) pos.setY(i, y);
  return g;
}

/** Corrugated cylinder wall (rainwater tank / silo): radius modulated by horizontal ribs. */
export function corrugatedCylinder(radius: number, height: number, sides: number, ribs: number, depth: number): THREE.BufferGeometry {
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= ribs * 2; i++) profile.push([radius + (i % 2 === 0 ? 0 : depth), (i / (ribs * 2)) * height]);
  return lathe(profile, sides);
}
