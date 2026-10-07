// The flat front face of the nose (detail 'high'), rebuilt as its own mesh so
// that the grille and intake openings are real holes with recessed, dark
// interiors instead of paint. The face's outer edge is exactly the last
// rounding ring of the body grid, and every point lies on the same surface the
// grid's face rows used: z = face(y) - sweep(x).
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import type { BodyProfile, Outline } from '@/car/models/profile-types';
import { makeCurve } from '@/car/models/curves';
import { regionUV } from '@/car/models/livery-layout';

export interface Fascia {
  /** Painted face with the openings cut out (livery atlas UVs, white vertex colours). */
  face: THREE.BufferGeometry;
  /** Opening walls and backs (atlas UVs, which show the painted honeycomb / black). */
  recess: THREE.BufferGeometry;
  /** Centre strut across the lower intake (dark plastic), or null. */
  strut: THREE.BufferGeometry | null;
}

type V2 = THREE.Vector2;

function contourOf(grid: BodyGrid): V2[] {
  const r = grid.rowAt.noseFace;
  const out: V2[] = [];
  for (let c = 0; c < grid.cols; c++) {
    const i = (r * grid.cols + c) * 3;
    const p = new THREE.Vector2(grid.rest[i], grid.rest[i + 1]);
    if (!out.length || out[out.length - 1].distanceTo(p) > 1e-4) out.push(p);
  }
  if (out.length > 2 && out[0].distanceTo(out[out.length - 1]) < 1e-4) out.pop();
  return out;
}

function area(poly: V2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function inside(poly: V2[], p: V2): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** Resampled, counter-clockwise hole, shrunk towards its centre until it fits inside the face. */
function hole(o: Outline, contour: V2[], maxEdge: number): V2[] | null {
  const pts: V2[] = [];
  for (let i = 0; i < o.length; i++) {
    const a = new THREE.Vector2(...o[i]);
    const b = new THREE.Vector2(...o[(i + 1) % o.length]);
    const k = Math.max(1, Math.ceil(a.distanceTo(b) / maxEdge));
    for (let j = 0; j < k; j++) pts.push(a.clone().lerp(b, j / k));
  }
  if (area(pts) < 0) pts.reverse();
  const c = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
  for (let shrink = 1; shrink > 0.5; shrink -= 0.05) {
    const s = pts.map((p) => c.clone().lerp(p, shrink));
    // Keep a 1.5 cm margin to the face edge.
    if (s.every((p) => inside(contour, c.clone().lerp(p, 1 + 0.015 / Math.max(0.02, p.distanceTo(c)))))) return s;
  }
  return null;
}

export function buildFascia(grid: BodyGrid, p: BodyProfile, high: boolean): Fascia {
  const face = makeCurve(p.nose.face);
  const sw = (x: number) => p.nose.sweep * Math.pow(Math.min(1, Math.abs(x)), p.nose.sweepPow);
  const zAt = (x: number, y: number) => face(y) - sw(x);
  const normalAt = (x: number, y: number) => {
    const e = 1e-3;
    const dsx = (sw(x + e) - sw(x - e)) / (2 * e);
    const dfy = (face(y + e) - face(y - e)) / (2 * e);
    return new THREE.Vector3(dsx, -dfy, 1).normalize();
  };
  const contour = contourOf(grid);
  const holes: Array<{ pts: V2[]; depth: number }> = [];
  p.art.frontOpenings.forEach((o, i) => {
    const pts = hole(o, contour, high ? 0.04 : 0.08);
    if (pts) holes.push({ pts, depth: p.art.frontDepths[i] ?? 0.08 });
  });

  // Face: triangulate with holes, then one midpoint subdivision lifted onto the surface
  // (edges along the outline or a hole rim stay straight, so they meet the neighbours exactly).
  const loops = [contour, ...holes.map((h) => h.pts)];
  const verts: V2[] = loops.flat();
  const loopOf: number[] = [];
  const indexIn: number[] = [];
  loops.forEach((l, li) => l.forEach((_, k) => { loopOf.push(li); indexIn.push(k); }));
  const tris = THREE.ShapeUtils.triangulateShape(contour, holes.map((h) => h.pts));
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  const z: number[] = verts.map((v) => zAt(v.x, v.y));
  const mids = new Map<string, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    let m = mids.get(key);
    if (m === undefined) {
      const onLoop = loopOf[a] === loopOf[b] && (Math.abs(indexIn[a] - indexIn[b]) === 1 || Math.abs(indexIn[a] - indexIn[b]) === loops[loopOf[a]].length - 1);
      const v = verts[a].clone().add(verts[b]).multiplyScalar(0.5);
      m = verts.length;
      verts.push(v);
      z.push(onLoop ? (z[a] + z[b]) / 2 : zAt(v.x, v.y));
      loopOf.push(-1);
      indexIn.push(-1);
      mids.set(key, m);
    }
    return m;
  };
  const emit = (a: number, b: number, c: number) => {
    const ccw = (verts[b].x - verts[a].x) * (verts[c].y - verts[a].y) - (verts[b].y - verts[a].y) * (verts[c].x - verts[a].x) > 0;
    for (const i of ccw ? [a, b, c] : [a, c, b]) {
      const v = verts[i];
      pos.push(v.x, v.y, z[i]);
      const n = normalAt(v.x, v.y);
      nor.push(n.x, n.y, n.z);
      uv.push(...regionUV('front', v.x, v.y));
    }
  };
  for (const [a, b, c] of tris) {
    if (!high) { emit(a, b, c); continue; }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    emit(a, ab, ca); emit(ab, b, bc); emit(ca, bc, c); emit(ab, bc, ca);
  }
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  faceGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  faceGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  faceGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  return { face: faceGeo, recess: recessGeometry(holes, zAt), strut: strutGeometry(p, zAt) };
}

/** A dark vertical strut standing in the intake, set 1 cm back from the face. */
function strutGeometry(p: BodyProfile, zAt: (x: number, y: number) => number): THREE.BufferGeometry | null {
  const st = p.art.intakeStrut;
  if (!st) return null;
  const h = st.y1 - st.y0;
  const zFront = zAt(st.x, (st.y0 + st.y1) / 2) - 0.01;
  const depth = st.depth - 0.012;
  const g = new THREE.BoxGeometry(st.width, h, depth);
  g.translate(st.x, (st.y0 + st.y1) / 2, zFront - depth / 2);
  return g;
}

/** Walls (facing into the opening) and a back plate for every hole. */
function recessGeometry(holes: Array<{ pts: V2[]; depth: number }>, zAt: (x: number, y: number) => number): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], col: number[] = [];
  // Walls are darkened (they catch the sun on the floor of deep intakes); backs keep the honeycomb.
  const put = (v: THREE.Vector3, u: readonly [number, number], shade = 1) => { pos.push(v.x, v.y, v.z); uv.push(u[0], u[1]); col.push(shade, shade, shade); };
  for (const { pts, depth } of holes) {
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(1 / pts.length);
    const rim = pts.map((q) => new THREE.Vector3(q.x, q.y, zAt(q.x, q.y)));
    const back = rim.map((r) => r.clone().setZ(r.z - depth));
    // Walls sample the atlas just inside the opening (painted black).
    const wallUV = pts.map((q) => regionUV('front', ...(c.clone().lerp(q, 0.9).toArray() as [number, number])));
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      put(rim[i], wallUV[i], 0.3); put(rim[j], wallUV[j], 0.3); put(back[j], wallUV[j], 0.15);
      put(rim[i], wallUV[i], 0.3); put(back[j], wallUV[j], 0.15); put(back[i], wallUV[i], 0.15);
    }
    for (const [a, b, d] of THREE.ShapeUtils.triangulateShape(pts, [])) {
      const ccw = (pts[b].x - pts[a].x) * (pts[d].y - pts[a].y) - (pts[b].y - pts[a].y) * (pts[d].x - pts[a].x) > 0;
      for (const i of ccw ? [a, b, d] : [a, d, b]) put(back[i], regionUV('front', pts[i].x, pts[i].y));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
