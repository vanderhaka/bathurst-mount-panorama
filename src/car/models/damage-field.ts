// Deformation fields for visual damage: rest positions and normals of a mesh
// (or of the body grid), accumulated dents with crumple noise, and an extra
// offset used for parts that hang or fall off.
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import type { BodyMeshes } from '@/car/models/body-mesh';

/** Per-vertex rest position, normal, accumulated dent and an extra (part-failure) offset. */
export interface Field { rest: Float32Array; normal: Float32Array; disp: Float32Array; extra?: Float32Array }

const hash = (x: number, y: number, z: number, k: number) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 19.19) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
};

export function gridField(grid: BodyGrid, shell: BodyMeshes): Field {
  const n = grid.rows * grid.cols;
  const normal = new Float32Array(n * 3);
  const qc = grid.cols - 1;
  const qn = shell.quadNormals;
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      let x = 0, y = 0, z = 0;
      for (const [rr, cc] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) {
        if (rr < 0 || cc < 0 || rr >= grid.rows - 1 || cc >= qc) continue;
        const q = (rr * qc + cc) * 3;
        x += qn[q]; y += qn[q + 1]; z += qn[q + 2];
      }
      const l = Math.hypot(x, y, z) || 1;
      const i = (r * grid.cols + c) * 3;
      normal[i] = x / l; normal[i + 1] = y / l; normal[i + 2] = z / l;
    }
  }
  return { rest: grid.rest, normal, disp: new Float32Array(n * 3) };
}

export function meshField(m: THREE.Mesh): Field {
  const g = m.geometry;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const rest = Float32Array.from(g.getAttribute('position').array as Float32Array);
  const normal = Float32Array.from(g.getAttribute('normal').array as Float32Array);
  return { rest, normal, disp: new Float32Array(rest.length) };
}

export interface Dent { c: THREE.Vector3; dir: THREE.Vector3; radius: number; depth: number; facingFloor: number }

/** Adds one dent to a field; returns per-vertex weight via `onWeight` (for scuffs). */
export function dentField(f: Field, d: Dent, maxDent: number, onWeight?: (i: number, w: number) => void): void {
  const { rest, normal, disp } = f;
  const r2 = d.radius * d.radius;
  for (let i = 0; i < rest.length / 3; i++) {
    const k = i * 3;
    const dx = rest[k] - d.c.x, dy = rest[k + 1] - d.c.y, dz = rest[k + 2] - d.c.z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    if (dist2 >= r2) continue;
    const t = 1 - dist2 / r2;
    const facing = Math.max(d.facingFloor, -(normal[k] * d.dir.x + normal[k + 1] * d.dir.y + normal[k + 2] * d.dir.z));
    const w = t * t * Math.min(1, facing);
    const a = d.depth * w;
    const px = rest[k], py = rest[k + 1], pz = rest[k + 2];
    // Crumple noise so the dent catches the light as creases, not a smooth dish.
    disp[k] += d.dir.x * a + hash(px, py, pz, 1) * a * 0.45;
    disp[k + 1] += d.dir.y * a + hash(px, py, pz, 2) * a * 0.45;
    disp[k + 2] += d.dir.z * a + hash(px, py, pz, 3) * a * 0.45;
    // Cap: never more than maxDent, never more than 40% of the way to the car's axis.
    const axis = Math.hypot(px, py - 0.55) * 0.4 + 0.02;
    const cap = Math.min(maxDent, axis);
    const len = Math.hypot(disp[k], disp[k + 1], disp[k + 2]);
    if (len > cap) { const s = cap / len; disp[k] *= s; disp[k + 1] *= s; disp[k + 2] *= s; }
    if (py + disp[k + 1] < 0.015) disp[k + 1] = 0.015 - py;
    onWeight?.(i, w);
  }
}

export function writeField(f: Field, out: Float32Array): void {
  const e = f.extra;
  for (let i = 0; i < out.length; i++) out[i] = f.rest[i] + f.disp[i] + (e ? e[i] : 0);
}
