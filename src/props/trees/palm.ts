import * as THREE from 'three';
import { Mesher, type FaceInfo } from '@/props/core/mesher';
import { createRng, lerp, type Rng } from '@/props/core/rng';
import { tube } from '@/props/core/shapes';

// Coastal palms. Variants 0-3 are tall coconut palms (ringed leaning trunk, wide drooping crown,
// dead fronds, coconuts); 4-5 are shorter, straighter foxtail palms with an upright crown.

export const PALM_VARIANTS = 6;

export interface PalmResult {
  near: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
  radius: number;
  height: number;
}

const TRUNK = [0x7a6a58, 0x5d5044];
const GREEN_LOW = 0x4f7a2c;
const GREEN_HIGH = 0x6d8f3a;
const TIP = 0x9a8238;
const DEAD = 0x6b4f2c;
const NUT = 0x4a3a22;

interface Frond {
  base: THREE.Vector3;
  yaw: number;
  length: number;
  /** Starting elevation (radians, negative hangs down) and total downward bend. */
  rise: number;
  bend: number;
  width: number;
}

/** One-sided frond strip: a spine with a zig-zag pinnate edge (alternating wide and short leaflets). */
function frondGeometry(f: Frond, segments: number, flip: boolean): THREE.BufferGeometry {
  const dir = new THREE.Vector3(Math.cos(f.yaw), 0, Math.sin(f.yaw));
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const spine: THREE.Vector3[] = [f.base.clone()];
  let angle = f.rise;
  for (let i = 1; i <= segments; i++) {
    angle -= (f.bend / segments) * (0.4 + 1.2 * (i / segments));
    const step = f.length / segments;
    spine.push(spine[i - 1].clone().addScaledVector(dir, Math.cos(angle) * step).add(new THREE.Vector3(0, Math.sin(angle) * step, 0)));
  }
  const edge = (i: number, sign: number): THREE.Vector3 => {
    const t = i / segments;
    const w = f.width * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * (i % 2 === 0 ? 0.55 : 1);
    return spine[i].clone().addScaledVector(side, sign * w).add(new THREE.Vector3(0, -w * 0.45, 0));
  };
  const out: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const [p, q, r] = flip ? [a, c, b] : [a, b, c];
    out.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
  };
  for (let i = 0; i < segments; i++) {
    for (const s of [1, -1]) {
      const a = edge(i, s), b = edge(i + 1, s);
      if (s > 0) { tri(spine[i], b, a); tri(spine[i], spine[i + 1], b); }
      else { tri(spine[i], a, b); tri(spine[i], b, spine[i + 1]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/** Adds a frond as two separate parts (front and back) so smoothing never merges opposite normals. */
function addFrond(mesher: Mesher, f: Frond, segments: number, colour: (face: FaceInfo) => THREE.Color): void {
  for (const flip of [false, true]) mesher.add(frondGeometry(f, segments, flip), colour, { jitter: 0.08 });
}

function liveColour(f: Frond, rng: Rng): (face: FaceInfo) => THREE.Color {
  const low = new THREE.Color(GREEN_LOW), high = new THREE.Color(GREEN_HIGH), tip = new THREE.Color(TIP);
  const mix = rng();
  return (face) => {
    const t = THREE.MathUtils.clamp(face.centroid.distanceTo(f.base) / f.length, 0, 1);
    const c = low.clone().lerp(high, mix);
    return t > 0.8 ? c.lerp(tip, (t - 0.8) / 0.2 * 0.7) : c.multiplyScalar(1 + 0.12 * face.normal.y);
  };
}

/** Ringed trunk: tapering tube with alternating dark/light bands every `band` metres. */
function addTrunk(near: Mesher, path: THREE.Vector3[], r0: number, r1: number, band: number): void {
  const radii = path.map((_, i) => lerp(r0, r1, Math.pow(i / (path.length - 1), 0.8)) * (i === 0 ? 1.15 : 1));
  const light = new THREE.Color(TRUNK[0]), dark = new THREE.Color(TRUNK[1]);
  near.add(tube(path, radii, 5, { capStart: false }), (f) => (Math.floor(f.centroid.y / band) % 2 === 0 ? light : dark), { jitter: 0.05 });
}

function farPalm(path: THREE.Vector3[], top: THREE.Vector3, reach: number, fronds: number): THREE.BufferGeometry {
  const far = new Mesher();
  far.add(tube([path[0], top], [0.2, 0.13], 4), TRUNK[0]);
  const green = new THREE.Color(GREEN_LOW).lerp(new THREE.Color(GREEN_HIGH), 0.5);
  const strips = fronds > 11 ? 3 : 2;
  for (let s = 0; s < strips; s++) {
    const yaw = (s / strips) * Math.PI, d = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), w = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(reach * 0.14);
    const pts = [top.clone().addScaledVector(d, -reach).add(new THREE.Vector3(0, -reach * 0.35, 0)), top.clone().add(new THREE.Vector3(0, reach * 0.12, 0)), top.clone().addScaledVector(d, reach).add(new THREE.Vector3(0, -reach * 0.35, 0))];
    for (const flip of [false, true]) {
      const out: number[] = [];
      for (let i = 0; i < 2; i++) {
        const [a, b] = [pts[i], pts[i + 1]];
        const quad = [a.clone().sub(w), b.clone().sub(w), b.clone().add(w), a.clone().add(w)];
        const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const k of order) out.push(quad[k].x, quad[k].y, quad[k].z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
      far.add(g, green);
    }
  }
  return far.build();
}

export function buildPalm(variant: number): PalmResult {
  const v = ((variant % PALM_VARIANTS) + PALM_VARIANTS) % PALM_VARIANTS;
  const coconut = v < 4;
  const rng = createRng(9100 + v * 389);
  const H = coconut ? rng.range(9, 14) : rng.range(5.4, 7.8);
  const lean = (coconut ? rng.range(2, 8) : rng.range(0, 2.5)) * (Math.PI / 180);
  const r0 = coconut ? rng.range(0.18, 0.22) : rng.range(0.16, 0.2);
  const r1 = coconut ? 0.13 : 0.11;
  const rings = Math.round(H / 0.55), band = H / rings;
  const offset = H * Math.tan(lean);
  const path: THREE.Vector3[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    path.push(new THREE.Vector3(offset * Math.pow(t, 1.6), t * H, 0));
  }
  const top = path[rings].clone();
  const near = new Mesher();
  addTrunk(near, path, r0, r1, band);

  const count = coconut ? rng.int(12, 16) : rng.int(9, 11);
  const segments = coconut ? 7 : 6;
  let reach = 0;
  for (let i = 0; i < count; i++) {
    const length = coconut ? rng.range(3.5, 5) : rng.range(2.6, 3.6);
    const f: Frond = {
      base: top.clone().add(new THREE.Vector3(0, coconut ? 0.1 : 0.05, 0)),
      yaw: (i / count) * Math.PI * 2 + rng.jitter(0.2),
      length,
      rise: coconut ? (0.35 + 0.9 * rng()) : (0.9 + 0.5 * rng()),
      bend: coconut ? rng.range(1.5, 2.1) : rng.range(0.7, 1.1),
      width: coconut ? rng.range(0.55, 0.75) : rng.range(0.35, 0.5),
    };
    reach = Math.max(reach, length * (coconut ? 0.8 : 0.55));
    addFrond(near, f, segments, liveColour(f, rng));
  }
  if (coconut) {
    const dead = new THREE.Color(DEAD);
    for (let i = 0; i < 3; i++) {
      const f: Frond = { base: top.clone().add(new THREE.Vector3(0, -0.2, 0)), yaw: rng.range(0, Math.PI * 2), length: rng.range(2.2, 3), rise: -0.9, bend: 0.5, width: 0.35 };
      addFrond(near, f, 5, () => dead.clone().multiplyScalar(0.85 + 0.3 * rng()));
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.range(0, Math.PI * 2);
      const nut = new THREE.IcosahedronGeometry(0.12, 0).translate(top.x + Math.cos(a) * 0.2, top.y - 0.3 - rng() * 0.12, Math.sin(a) * 0.2);
      near.add(nut, NUT, { jitter: 0.1 });
    }
  }
  const nearGeo = near.build();
  nearGeo.computeBoundingBox();
  return { near: nearGeo, far: farPalm(path, top, reach, count), radius: reach + Math.abs(offset) * 0.3, height: nearGeo.boundingBox!.max.y };
}
