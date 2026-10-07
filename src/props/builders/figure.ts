import * as THREE from 'three';
import type { FaceInfo } from '@/props/core/mesher';
import { Mesher } from '@/props/core/mesher';
import { loftRings, tube } from '@/props/core/shapes';

// Medium-poly human figure built from lofted cross-sections (torso, head) and
// tapered limb tubes along joint paths. Faces +Z. The shirt is painted white
// and marked tintable so the instance colour becomes the shirt colour.

export interface Joints {
  pelvis: THREE.Vector3;
  neck: THREE.Vector3;
  knees: [THREE.Vector3, THREE.Vector3];
  ankles: [THREE.Vector3, THREE.Vector3];
  toes: [THREE.Vector3, THREE.Vector3];
  elbows: [THREE.Vector3, THREE.Vector3];
  wrists: [THREE.Vector3, THREE.Vector3];
  hands: [THREE.Vector3, THREE.Vector3];
}

export interface Outfit {
  skin: number;
  hair: number;
  pants: number;
  shoes: number;
  sleeves: 'short' | 'long';
  legs: 'long' | 'shorts';
  hat?: { kind: 'cap' | 'wide'; colour: number };
  /** Torso/limb thickness multiplier. */
  girth: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function ellipseRing(c: THREE.Vector3, hw: number, hd: number, n: number, phase = 0): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push(V(c.x + Math.cos(a) * hw, c.y, c.z - Math.sin(a) * hd));
  }
  return out;
}

function addTorso(m: Mesher, j: Joints, o: Outfit, shirtLine: number): void {
  const g = o.girth;
  // t along pelvis→neck, half-width, half-depth, forward offset.
  const rows: Array<[number, number, number, number]> = [
    [0, 0.165, 0.105, 0],
    [0.22, 0.15, 0.1, 0.005],
    [0.58, 0.178, 0.118, 0.018],
    [0.86, 0.2, 0.1, 0.0],
    [1, 0.075, 0.065, 0.005],
  ];
  const rings = rows.map(([t, hw, hd, fz]) => {
    const c = j.pelvis.clone().lerp(j.neck, t);
    c.z += fz;
    return ellipseRing(c, hw * g, hd * g, 8, Math.PI / 8);
  });
  m.add(loftRings(rings, { capStart: true, capEnd: true }), (f) => (f.centroid.y > shirtLine ? 0xffffff : o.pants), { tint: 'white' });
}

function addHead(m: Mesher, j: Joints, o: Outfit): void {
  const n = j.neck;
  const rows: Array<[number, number, number]> = [
    // dy, radius, forward offset
    [0.0, 0.05, 0],
    [0.07, 0.074, 0.018],
    [0.16, 0.089, 0.012],
    [0.24, 0.086, 0.0],
    [0.3, 0.058, -0.01],
  ];
  const rings = rows.map(([dy, r, fz]) => ellipseRing(V(n.x, n.y + dy, n.z + fz), r, r * 1.12, 6, Math.PI / 6));
  const brow = n.y + 0.2;
  const hairBack = n.y + 0.1;
  const hatLine = o.hat ? n.y + 0.215 : Infinity;
  m.add(loftRings(rings, { capEnd: true }), (f: FaceInfo) => {
    if (f.centroid.y > hatLine) return o.hat!.colour;
    if (f.centroid.y > brow || (f.centroid.y > hairBack && f.normal.z < -0.35)) return o.hair;
    return o.skin;
  });
  if (o.hat?.kind === 'cap') {
    const y = n.y + 0.225;
    m.add(
      loftRings([
        [V(n.x - 0.07, y - 0.02, n.z + 0.19), V(n.x + 0.07, y - 0.02, n.z + 0.19), V(n.x + 0.085, y, n.z + 0.06), V(n.x - 0.085, y, n.z + 0.06)],
        [V(n.x - 0.07, y - 0.005, n.z + 0.19), V(n.x + 0.07, y - 0.005, n.z + 0.19), V(n.x + 0.085, y + 0.015, n.z + 0.06), V(n.x - 0.085, y + 0.015, n.z + 0.06)],
      ], { capStart: true, capEnd: true }),
      o.hat.colour,
    );
  } else if (o.hat?.kind === 'wide') {
    const y = n.y + 0.215;
    const inner = ellipseRing(V(n.x, y, n.z), 0.088, 0.098, 7);
    const outer = ellipseRing(V(n.x, y - 0.025, n.z), 0.2, 0.21, 7);
    const crown = ellipseRing(V(n.x, y + 0.11, n.z), 0.075, 0.085, 7);
    m.add(loftRings([outer, inner, crown], { capEnd: true }), o.hat.colour);
    m.add(loftRings([inner, outer]), new THREE.Color().setHex(o.hat.colour).multiplyScalar(0.7));
  }
}

function addLimbs(m: Mesher, j: Joints, o: Outfit): void {
  const g = o.girth;
  for (const s of [0, 1] as const) {
    const side = s === 0 ? -1 : 1;
    const hip = j.pelvis.clone().add(V(side * 0.09 * g, -0.02, 0));
    const legLen = hip.distanceTo(j.knees[s]) + j.knees[s].distanceTo(j.ankles[s]);
    const shortsEnd = hip.distanceTo(j.knees[s]) * 0.82;
    m.add(tube([hip, j.knees[s], j.ankles[s]], [0.085 * g, 0.058, 0.046], 5, { phase: Math.PI / 5 }), (f) => {
      const d = f.centroid.distanceTo(hip);
      return o.legs === 'shorts' && d > shortsEnd && d < legLen ? o.skin : o.pants;
    });
    // Shoe: a squared loft from heel to toe.
    const dir = j.toes[s].clone().sub(j.ankles[s]).setY(0).normalize();
    const heel = j.ankles[s].clone().addScaledVector(dir, -0.05).setY(Math.max(0.045, j.ankles[s].y - 0.045));
    const toe = j.toes[s].clone().setY(Math.max(0.035, j.toes[s].y));
    m.add(tube([heel, toe], [0.064, 0.05], 4, { capStart: true, capEnd: true, phase: Math.PI / 4, up: V(0, 1, 0) }), o.shoes);
    // Arm: shoulder → sleeve end → elbow → wrist → hand.
    const shoulder = j.neck.clone().add(V(side * 0.19 * g, -0.1, -0.01));
    const sleeveEnd = shoulder.clone().lerp(j.elbows[s], o.sleeves === 'short' ? 0.55 : 1.0);
    const path = o.sleeves === 'short' ? [shoulder, sleeveEnd, j.elbows[s], j.wrists[s], j.hands[s]] : [shoulder, j.elbows[s], j.wrists[s], j.hands[s]];
    const radii = o.sleeves === 'short' ? [0.054 * g, 0.048 * g, 0.042, 0.034, 0.03] : [0.054 * g, 0.045 * g, 0.037, 0.03];
    const sleeveLimit = o.sleeves === 'short' ? shoulder.distanceTo(sleeveEnd) : shoulder.distanceTo(j.elbows[s]) + j.elbows[s].distanceTo(j.wrists[s]);
    m.add(tube(path, radii, 5, { capEnd: true, phase: s }), (f) => (f.centroid.distanceTo(shoulder) < sleeveLimit * (o.sleeves === 'short' ? 1 : 0.93) ? 0xffffff : o.skin), { tint: 'white' });
  }
}

/** Builds a full figure into the given (tintable) mesher. */
export function addFigure(m: Mesher, j: Joints, o: Outfit): void {
  addTorso(m, j, o, j.pelvis.y + 0.1);
  addHead(m, j, o);
  addLimbs(m, j, o);
}

/** Far LOD figure (~40 tris): box-ish legs, torso and head as low lofts. */
export function addFigureLod(m: Mesher, j: Joints, o: Outfit): void {
  const g = o.girth;
  for (const s of [0, 1] as const) {
    const hip = j.pelvis.clone().add(V((s ? 1 : -1) * 0.09 * g, 0, 0));
    m.add(tube([hip, j.knees[s], j.ankles[s].clone().setY(0)], [0.08 * g, 0.06, 0.05], 4, { phase: Math.PI / 4 }), o.pants);
  }
  const rings = [0, 0.6, 0.9, 1].map((t, i) => ellipseRing(j.pelvis.clone().lerp(j.neck, t), [0.16, 0.18, 0.2, 0.08][i] * g, [0.1, 0.11, 0.1, 0.06][i] * g, 4, Math.PI / 4));
  m.add(loftRings(rings, { capEnd: true }), (f) => (f.centroid.y > j.pelvis.y + 0.08 ? 0xffffff : o.pants), { tint: 'white' });
  const head = new THREE.OctahedronGeometry(0.1, 0).scale(0.9, 1.25, 1).translate(j.neck.x, j.neck.y + 0.14, j.neck.z);
  m.add(head, (f) => (f.normal.y > 0.3 || f.normal.z < -0.3 ? (o.hat ? o.hat.colour : o.hair) : o.skin));
}
