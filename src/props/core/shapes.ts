import * as THREE from 'three';
import type { Rng } from '@/props/core/rng';

// Lofted / lathed / displaced shapes. All return non-indexed or indexed
// geometries with a position attribute only; Mesher adds normals and colours.

/** Connects rings of equal point count with quads. Optional fan caps at both ends. */
export function loftRings(rings: THREE.Vector3[][], opts: { capStart?: boolean; capEnd?: boolean; closed?: boolean } = {}): THREE.BufferGeometry {
  const closed = opts.closed ?? true;
  const out: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const n = rings[0].length;
  const segs = closed ? n : n - 1;
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r];
    const B = rings[r + 1];
    for (let i = 0; i < segs; i++) {
      const j = (i + 1) % n;
      push(A[i], A[j], B[j]);
      push(A[i], B[j], B[i]);
    }
  }
  const cap = (ring: THREE.Vector3[], flip: boolean) => {
    const c = ring.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      if (flip) push(c, ring[j], ring[i]);
      else push(c, ring[i], ring[j]);
    }
  };
  if (opts.capStart) cap(rings[0], true);
  if (opts.capEnd) cap(rings[rings.length - 1], false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

export interface TubeOptions {
  capStart?: boolean;
  capEnd?: boolean;
  /** Rotation of the first ring vertex (radians). */
  phase?: number;
  /** Cross-section scale along the frame's binormal (ellipse). */
  ovality?: number;
  /** Random radial jitter per vertex (fraction of radius). */
  rng?: Rng;
  roughness?: number;
  /** Preferred "up" for the first frame normal (keeps flattened tubes oriented). */
  up?: THREE.Vector3;
}

/** Tube along a polyline with per-point radii (parallel-transport frames). */
export function tube(path: THREE.Vector3[], radii: number[] | number, sides: number, opts: TubeOptions = {}): THREE.BufferGeometry {
  const rings: THREE.Vector3[][] = [];
  const tangents = path.map((_, i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
  const up = opts.up ?? (Math.abs(tangents[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
  let normal = up.clone().sub(tangents[0].clone().multiplyScalar(up.dot(tangents[0]))).normalize();
  const phase = opts.phase ?? 0;
  const oval = opts.ovality ?? 1;
  for (let i = 0; i < path.length; i++) {
    const t = tangents[i];
    normal = normal.sub(t.clone().multiplyScalar(normal.dot(t))).normalize();
    const bin = new THREE.Vector3().crossVectors(t, normal).normalize();
    const r = typeof radii === 'number' ? radii : radii[i];
    const ring: THREE.Vector3[] = [];
    for (let s = 0; s < sides; s++) {
      const a = phase + (s / sides) * Math.PI * 2;
      const k = opts.rng ? 1 + opts.rng.jitter(opts.roughness ?? 0.12) : 1;
      ring.push(
        path[i]
          .clone()
          .addScaledVector(normal, Math.cos(a) * r * k)
          .addScaledVector(bin, Math.sin(a) * r * k * oval),
      );
    }
    rings.push(ring);
  }
  return loftRings(rings, { capStart: opts.capStart, capEnd: opts.capEnd });
}

/** Straight strut between two points (n-sided prism, optional caps). */
export function strut(a: THREE.Vector3, b: THREE.Vector3, radius: number, sides = 4, caps = false, phase = Math.PI / 4): THREE.BufferGeometry {
  return tube([a, b], radius, sides, { capStart: caps, capEnd: caps, phase });
}

/** Lathe around +Y from a (radius, y) profile, bottom to top. r = 0 makes a pole point. */
export function lathe(profile: Array<[number, number]>, sides: number, opts: { phase?: number; scaleX?: number; scaleZ?: number; capStart?: boolean; capEnd?: boolean } = {}): THREE.BufferGeometry {
  const phase = opts.phase ?? 0;
  const sx = opts.scaleX ?? 1;
  const sz = opts.scaleZ ?? 1;
  const rings = profile.map(([r, y]) => {
    const ring: THREE.Vector3[] = [];
    for (let s = 0; s < sides; s++) {
      const a = phase + (s / sides) * Math.PI * 2;
      ring.push(new THREE.Vector3(Math.cos(a) * r * sx, y, -Math.sin(a) * r * sz));
    }
    return ring;
  });
  return loftRings(rings, { capStart: opts.capStart, capEnd: opts.capEnd });
}

/**
 * Displaced icosahedron ("clump" / "boulder"): watertight (shared vertices move together).
 * `squashBelow` flattens the lower half (cloud-like clump bottoms).
 */
export function blob(scale: THREE.Vector3, detail: number, rng: Rng, amount: number, squashBelow = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position');
  const offsets = new Map<string, number>();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let k = offsets.get(key);
    if (k === undefined) {
      k = 1 + rng.jitter(amount);
      offsets.set(key, k);
    }
    v.multiplyScalar(k);
    if (v.y < 0) v.y *= squashBelow;
    v.multiply(scale);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

/** A flat polygon (convex or star-shaped around its centroid) given in order; optionally double-sided. */
export function polygon(points: THREE.Vector3[], doubleSided = false): THREE.BufferGeometry {
  const out: number[] = [];
  const c = points.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / points.length);
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
    if (doubleSided) out.push(c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  return g;
}

/** Quad a-b-c-d (counter-clockwise seen from the front). */
export function quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, doubleSided = false): THREE.BufferGeometry {
  const out = [a, b, c, a, c, d];
  if (doubleSided) out.push(a, c, b, a, d, c);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.flatMap((p) => [p.x, p.y, p.z]), 3));
  return g;
}

/** Extrudes a 2D outline (x, y) along +Z by `depth` (front face at z = depth). */
export function extrude(outline: Array<[number, number]>, depth: number, holes: Array<Array<[number, number]>> = []): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

/** Axis-aligned box centred at (x, y, z). */
export function box(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g;
}

/** Applies translation / Euler rotation / scale (in that order: scale, rotate, translate). */
export function place(g: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s: number | THREE.Vector3 = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    typeof s === 'number' ? new THREE.Vector3(s, s, s) : s,
  );
  return g.applyMatrix4(m);
}
