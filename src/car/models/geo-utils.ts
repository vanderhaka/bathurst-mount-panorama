// Geometry helpers shared by the car part builders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { paintGeometry } from '@/art/materials';
import type { Outline } from '@/car/models/profile-types';

/** Non-indexed copy with only position/normal (+ color when `keepColour`). */
function normalise(g: THREE.BufferGeometry, keepColour: boolean): THREE.BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g.clone();
  for (const name of Object.keys(out.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(keepColour && name === 'color')) out.deleteAttribute(name);
  }
  if (!out.getAttribute('normal')) out.computeVertexNormals();
  return out;
}

/** Merges geometries into one (colours kept only if every part has them). */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const live = parts.filter((p) => p.getAttribute('position').count > 0);
  if (!live.length) return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([], 3));
  const colour = live.every((p) => !!p.getAttribute('color'));
  const g = mergeGeometries(live.map((p) => normalise(p, colour)));
  if (!g) throw new Error('car-models: geometry merge failed');
  return g;
}

/** Paints a geometry with one sRGB colour (vertex colours) and returns it. */
export function tint(g: THREE.BufferGeometry, colour: number): THREE.BufferGeometry {
  return paintGeometry(g, colour);
}

/** Extrudes a 2D outline (a, b) by `depth` and maps it into 3D with `place`. */
export function extrude(outline: Outline, depth: number, place: (a: number, b: number, d: number) => [number, number, number], bevel = 0): THREE.BufferGeometry {
  const shape = new THREE.Shape(outline.map(([a, b]) => new THREE.Vector2(a, b)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = place(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, x, y, z);
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  return fixWinding(ng);
}

/** Flips triangles whose normals point towards the centroid (after mirroring maps). */
function fixWinding(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), n = new THREE.Vector3(), m = new THREE.Vector3();
  let inward = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(m.subVectors(d, a));
    m.copy(a).add(b).add(d).divideScalar(3).sub(c);
    inward += n.dot(m) < 0 ? 1 : -1;
  }
  if (inward > 0) {
    for (let i = 0; i < p.count; i += 3) {
      const x = p.getX(i + 1), y = p.getY(i + 1), z = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, x, y, z);
    }
    g.computeVertexNormals();
  }
  return g;
}

/**
 * Lofts closed cross-sections (same point count) into a tube-like surface with
 * optional end caps. Sections are arrays of 3D points.
 */
export function loft(sections: THREE.Vector3[][], capStart: boolean, capEnd: boolean): THREE.BufferGeometry {
  const n = sections[0].length;
  const pos: number[] = [];
  const idx: number[] = [];
  for (const s of sections) for (const v of s) pos.push(v.x, v.y, v.z);
  for (let r = 0; r < sections.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i, b = r * n + ((i + 1) % n), c = (r + 1) * n + i, d = (r + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (s: THREE.Vector3[], base: number, flip: boolean) => {
    const centre = s.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(n);
    const ci = pos.length / 3;
    pos.push(centre.x, centre.y, centre.z);
    for (let i = 0; i < n; i++) {
      const a = base + i, b = base + ((i + 1) % n);
      if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (capStart) cap(sections[0], 0, false);
  if (capEnd) cap(sections[sections.length - 1], (sections.length - 1) * n, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return fixWinding(ng);
}

/** Ellipse-ish rounded section in a plane spanned by unit vectors u, v around c. */
export function ringSection(c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, ru: number, rv: number, n: number, squareness = 2): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const e = 2 / squareness;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ct = Math.cos(t), st = Math.sin(t);
    const a = Math.sign(ct) * Math.pow(Math.abs(ct), e) * ru;
    const b = Math.sign(st) * Math.pow(Math.abs(st), e) * rv;
    out.push(c.clone().addScaledVector(u, a).addScaledVector(v, b));
  }
  return out;
}
