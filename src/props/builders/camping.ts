import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { cylinder } from '@/props/core/prims';
import { box, lathe, loftRings, polygon, quad, strut } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';

// Camping gear for McPhillamy Park / the campgrounds: dome and tunnel tents,
// a cabin tent, a swag, and pop-up gazebos. Fly / canopy = instance colour.

export const CAMPING_VARIANTS = { tent: 5, gazebo: 4 } as const;

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Dome fly: a 2-pole dome whose fly sags between the crossing poles, with its hem
 * raised `hem` m off the ground and flared out. `sides` should be a multiple of 4.
 */
function domeFly(a: number, b: number, h: number, sides: number, hem: number, cx = 0, cz = 0): THREE.BufferGeometry {
  const rings: THREE.Vector3[][] = [];
  const levels: Array<[number, number]> = [
    // [height fraction of the dome above the hem, radius fraction]
    [0, 1.08],
    [0.28, 1.0],
    [0.62, 0.8],
    [0.88, 0.45],
  ];
  for (const [t, r] of levels) {
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2 + Math.PI / 4;
      // Poles run along the diagonals; the fly sags between them.
      const onPole = i % (sides / 4) === 0;
      const sag = onPole || t === 0 ? 1 : 0.93;
      const y = hem + (h - hem) * t * (onPole ? 1 : 0.96);
      ring.push(V(cx + Math.cos(ang) * a * r * sag, y, cz - Math.sin(ang) * b * r * sag));
    }
    rings.push(ring);
  }
  rings.push(Array.from({ length: sides }, () => V(cx, h, cz)));
  return loftRings(rings);
}

/** Double-sided triangle. */
function tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, b].flatMap((p) => [p.x, p.y, p.z]), 3));
}

/** Guy line from a point on the fly to a peg in the ground, plus the peg. */
function guyLine(m: Mesher, from: THREE.Vector3, peg: THREE.Vector3): void {
  m.add(strut(from, peg, 0.011, 3, false, 0), BUILDING.offWhite);
  m.add(strut(peg.clone().setY(-0.05), peg.clone().setY(0.12), 0.018, 3, false, 0), TRACKSIDE.fencePost);
}

/** Small/large 2-pole dome: inner tent showing under a raised fly, front vestibule, four guy lines. */
function domeTent(m: Mesher, big: boolean): void {
  const ground = PROPS_LOOK.camping.groundsheet;
  const inner = new THREE.Color().setHex(BUILDING.offWhite).multiplyScalar(0.72);
  const [a, b, h] = big ? [1.3, 1.2, 1.5] : [1.05, 0.85, 1.15];
  const hem = 0.16;
  // Inner tent wall below the fly hem (pale mesh), on a dark groundsheet.
  m.add(lathe([[1, 0.02], [0.98, hem + 0.12]], 12, { scaleX: a * 0.97, scaleZ: b * 0.97, phase: Math.PI / 12 }), inner);
  m.add(domeFly(a, b, h, 12, hem), 0xffffff, { tint: true, jitter: 0.03 });
  // Vestibule on the front: two fly panels pulled out to a peg; the right one is the
  // door, rolled open (dark opening).
  const top = V(0, h * 0.86, b * 0.25);
  const lb = V(-a * 0.82, hem, b * 0.55);
  const rb = V(a * 0.82, hem, b * 0.55);
  const tip = V(0, 0.08, b + (big ? 0.95 : 0.7));
  m.add(tri(lb, tip, top), 0xffffff, { tint: true });
  // Right panel: unzipped down the middle, an inverted-V opening between two fly flaps.
  const pa = tip.clone().lerp(rb, 0.25);
  const pb = tip.clone().lerp(rb, 0.72);
  m.add(tri(tip, pa, top), 0xffffff, { tint: true });
  m.add(tri(pb, rb, top), 0xffffff, { tint: true });
  m.add(tri(pa, pb, top), new THREE.Color().setHex(ground).multiplyScalar(0.65));
  // Guy lines from the pole ends at two-thirds height out to pegs.
  for (let k = 0; k < 4; k++) {
    const ang = Math.PI / 4 + (k * Math.PI) / 2;
    const c = Math.cos(ang);
    const s = -Math.sin(ang);
    if (s > 0.5 && k === 1) continue; // the front-left pole is guyed through the vestibule
    guyLine(m, V(c * a * 0.78, h * 0.6, s * b * 0.78), V(c * a * 1.75, 0.02, s * b * 1.75));
  }
  guyLine(m, tip.clone().setY(0.12), V(0, 0.02, tip.z + 0.45));
}

export function buildTent(variant: number): BuiltProp {
  const m = new Mesher(true);
  const ground = PROPS_LOOK.camping.groundsheet;
  if (variant === 0 || variant === 1) {
    domeTent(m, variant === 1);
    return { geometry: m.build(), radius: variant === 1 ? 2.4 : 1.9 };
  }
  if (variant === 2) {
    // Tunnel tent: three hoops of falling height along X, closed ends.
    const hoops = [-1.6, -0.5, 0.6, 1.7];
    const heights = [0.75, 1.15, 1.25, 0.9];
    const rings = hoops.map((x, k) => {
      const ring: THREE.Vector3[] = [];
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI;
        ring.push(V(x, Math.sin(t) * heights[k], Math.cos(t) * 0.85));
      }
      return ring.reverse();
    });
    m.add(loftRings(rings, { capStart: true, capEnd: true }), (f) => (f.centroid.y < 0.08 ? ground : f.normal.x > 0.8 && f.centroid.y < 0.75 && Math.abs(f.centroid.z) < 0.4 ? new THREE.Color().setHex(ground).multiplyScalar(0.7) : 0xffffff), { tint: 'white', jitter: 0.03 });
    // Pole sleeves (darker bands over each hoop) and guy lines out from the hoops and both ends.
    hoops.forEach((x, k) => {
      const band = Array.from({ length: 9 }, (_, i) => {
        const t = (i / 8) * Math.PI;
        return V(x, Math.sin(t) * heights[k] + 0.012, Math.cos(t) * 0.862);
      });
      for (let i = 0; i < 8; i++) m.add(strut(band[i], band[i + 1], 0.03, 3, false, 0), BUILDING.darkGrey);
    });
    for (const s of [-1, 1]) {
      guyLine(m, V(s * 1.6, 0.6, 0), V(s * 2.5, 0.02, 0));
      guyLine(m, V(-0.5, 0.9, s * 0.62), V(-0.5, 0.02, s * 1.55));
      guyLine(m, V(0.6, 0.95, s * 0.62), V(0.6, 0.02, s * 1.55));
    }
    return { geometry: m.build(), radius: 2.6 };
  }
  if (variant === 3) {
    // Cabin (family) tent: upright walls, pitched roof, dark mesh windows.
    const w = 3.0;
    const d = 2.4;
    const wall = 1.6;
    m.add(box(w, wall, d, 0, wall / 2, 0), (f) => (f.centroid.y < 0.1 ? ground : 0xffffff), { tint: 'white' });
    // Mesh windows on the sides and front, and the zipped door (laid on the walls).
    const mesh = new THREE.Color().setHex(ground).multiplyScalar(0.8);
    for (const s of [-1, 1]) {
      const x = s * (w / 2 + 0.01);
      const [z0, z1] = [-0.7, 0.7];
      m.add(s > 0 ? quad(V(x, 0.75, z1), V(x, 0.75, z0), V(x, 1.3, z0), V(x, 1.3, z1)) : quad(V(x, 0.75, z0), V(x, 0.75, z1), V(x, 1.3, z1), V(x, 1.3, z0)), mesh);
      m.add(quad(V(s * 0.85 - 0.4, 0.75, d / 2 + 0.01), V(s * 0.85 + 0.4, 0.75, d / 2 + 0.01), V(s * 0.85 + 0.4, 1.3, d / 2 + 0.01), V(s * 0.85 - 0.4, 1.3, d / 2 + 0.01)), mesh);
    }
    m.add(quad(V(-0.35, 0.05, d / 2 + 0.01), V(0.35, 0.05, d / 2 + 0.01), V(0.35, 1.5, d / 2 + 0.01), V(-0.35, 1.5, d / 2 + 0.01)), new THREE.Color().setHex(ground).multiplyScalar(0.9));
    const roof = loftRings([
      [V(-w / 2 - 0.1, wall - 0.05, -d / 2 - 0.15), V(-w / 2 - 0.1, wall + 0.6, 0), V(-w / 2 - 0.1, wall - 0.05, d / 2 + 0.15)],
      [V(w / 2 + 0.1, wall - 0.05, -d / 2 - 0.15), V(w / 2 + 0.1, wall + 0.6, 0), V(w / 2 + 0.1, wall - 0.05, d / 2 + 0.15)],
    ], { capStart: true, capEnd: true });
    m.add(roof, 0xffffff, { tint: 'white' });
    // Awning over the door.
    m.add(quad(V(-0.8, 1.55, d / 2), V(0.8, 1.55, d / 2), V(0.8, 1.35, d / 2 + 1.0), V(-0.8, 1.35, d / 2 + 1.0), true), 0xffffff, { tint: 'white' });
    for (const x of [-0.8, 0.8]) {
      m.add(cylinder(0.015, 0.015, 0, 1.35, 4).translate(x, 0, d / 2 + 1.0), TRACKSIDE.fencePost);
      guyLine(m, V(x, 1.35, d / 2 + 1.0), V(x * 1.6, 0.02, d / 2 + 1.9));
    }
    for (const [x, z] of [[-1, -1], [1, -1]]) guyLine(m, V(x * (w / 2), wall, z * (d / 2)), V(x * (w / 2 + 0.9), 0.02, z * (d / 2 + 0.9)));
    return { geometry: m.build(), radius: 2.6 };
  }
  // Swag: low canvas bedroll with a single hoop at the head end.
  const rings = [-1.05, -0.6, 0.55, 1.05].map((x, k) => {
    const h = [0.22, 0.55, 0.3, 0.2][k];
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = (i / 6) * Math.PI;
      ring.push(V(x, 0.02 + Math.sin(t) * h, Math.cos(t) * 0.45));
    }
    return ring.reverse();
  });
  m.add(loftRings(rings, { capStart: true, capEnd: true }), (f) => (f.centroid.y < 0.06 ? ground : 0xffffff), { tint: 'white', jitter: 0.04 });
  return { geometry: m.build(), radius: 1.1 };
}

/** Pop-up gazebo: silver legs, valance and a peaked canopy (instance colour). */
export function buildGazebo(variant: number): BuiltProp {
  const m = new Mesher(true);
  const w = variant === 1 ? 4.5 : variant === 3 ? 6 : 3;
  const d = 3;
  const eave = 2.1;
  const peak = 2.85;
  const legs = TRACKSIDE.armco;
  const xs = variant === 1 ? [-w / 2, 0, w / 2] : variant === 3 ? [-w / 2, 0, w / 2] : [-w / 2, w / 2];
  for (const x of xs) {
    for (const z of [-d / 2, d / 2]) {
      m.add(box(0.04, eave, 0.04, x, eave / 2, z), legs);
      m.add(box(0.22, 0.12, 0.22, x, 0.06, z), BUILDING.darkGrey);
    }
  }
  // Canopy peaks (one per 3 m bay).
  const bays = variant === 3 ? 2 : 1;
  const bw = w / bays;
  for (let i = 0; i < bays; i++) {
    const cx = -w / 2 + bw * (i + 0.5);
    const e = [V(cx - bw / 2 - 0.05, eave, d / 2 + 0.05), V(cx + bw / 2 + 0.05, eave, d / 2 + 0.05), V(cx + bw / 2 + 0.05, eave, -d / 2 - 0.05), V(cx - bw / 2 - 0.05, eave, -d / 2 - 0.05)];
    const ridge = bw > d + 0.2 ? 0.6 : 0;
    const p0 = V(cx - ridge, peak, 0);
    const p1 = V(cx + ridge, peak, 0);
    const tris = [e[0], e[1], p1, e[0], p1, p0, e[1], e[2], p1, e[2], e[3], p0, e[2], p0, p1, e[3], e[0], p0];
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(tris.flatMap((p) => [p.x, p.y, p.z]), 3));
    m.add(g, 0xffffff, { tint: 'white' });
    const under = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([...tris].reverse().flatMap((p) => [p.x, p.y, p.z]), 3));
    m.add(under, new THREE.Color(0.78, 0.78, 0.78), { tint: true });
  }
  // Valance skirt.
  const hx = w / 2 + 0.05;
  const hz = d / 2 + 0.05;
  const corners = [V(-hx, 0, hz), V(hx, 0, hz), V(hx, 0, -hz), V(-hx, 0, -hz)];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    m.add(quad(V(a.x, eave - 0.22, a.z), V(b.x, eave - 0.22, b.z), V(b.x, eave, b.z), V(a.x, eave, a.z), true), 0xffffff, { tint: 'white' });
  }
  if (variant === 2) {
    // Back and one side wall.
    m.add(quad(V(w / 2, 0.02, -d / 2), V(-w / 2, 0.02, -d / 2), V(-w / 2, eave, -d / 2), V(w / 2, eave, -d / 2), true), 0xffffff, { tint: 'white' });
    m.add(quad(V(-w / 2, 0.02, -d / 2), V(-w / 2, 0.02, d / 2), V(-w / 2, eave, d / 2), V(-w / 2, eave, -d / 2), true), 0xffffff, { tint: 'white' });
  }
  if (variant === 0 || variant === 3) {
    // Folding table and an esky under the canopy.
    m.add(box(1.8, 0.04, 0.7, 0, 0.72, -0.4), BUILDING.white);
    for (const [x, z] of [[-0.85, -0.7], [0.85, -0.7], [-0.85, -0.1], [0.85, -0.1]]) m.add(box(0.03, 0.72, 0.03, x, 0.36, z), legs);
    m.add(box(0.6, 0.38, 0.4, 0.9, 0.19, 0.6), PROPS_LOOK.camping.esky);
    m.add(polygon([V(0.6, 0.39, 0.8), V(1.2, 0.39, 0.8), V(1.2, 0.39, 0.4), V(0.6, 0.39, 0.4)]), BUILDING.accentBlue);
  }
  return { geometry: m.build(), radius: Math.hypot(w / 2, d / 2) };
}
