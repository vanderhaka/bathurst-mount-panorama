// Turns the classified body grid into indexed meshes (paint, glass, dark,
// windscreen banner, tinted side/rear glass, coarse cabin liner). Normals are smooth inside a surface and
// split at hard creases and material boundaries; they are recomputed from the
// grid after every dent, so damage keeps clean shading.
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';
import { CP } from '@/car/models/body-section';
import { classifyQuads, isHardColumn, GLASS_FRONT, MAT_DARK, MAT_GLASS, MAT_PAINT, REGIONS, type QuadInfo } from '@/car/models/body-classify';
import { regionCoords, regionUV } from '@/car/models/livery-layout';

export interface EmittedMesh {
  geometry: THREE.BufferGeometry;
  /** Grid vertex of each emitted vertex. */
  grid: Int32Array;
  /** Up to 4 quads whose normals are averaged for each emitted vertex (-1 = none). */
  quads: Int32Array;
  offset: number;
  flip: boolean;
}

export interface BodyMeshes {
  paint: EmittedMesh;
  /** Windscreen. */
  glass: EmittedMesh;
  /** Side and rear windows (darker tint). */
  tinted: EmittedMesh;
  dark: EmittedMesh;
  banner: EmittedMesh;
  shell: EmittedMesh | null;
  info: QuadInfo;
  quadNormals: Float32Array;
}

class Emitter {
  readonly map = new Map<number, number>();
  readonly grid: number[] = [];
  readonly quads: number[] = [];
  readonly uv: number[] = [];
  readonly index: number[] = [];
  vertex(key: number, gv: number, comp: number[], uv: readonly [number, number]): number {
    let i = this.map.get(key);
    if (i === undefined) {
      i = this.grid.length;
      this.map.set(key, i);
      this.grid.push(gv);
      this.quads.push(comp[0] ?? -1, comp[1] ?? -1, comp[2] ?? -1, comp[3] ?? -1);
      this.uv.push(uv[0], uv[1]);
    }
    return i;
  }
  build(offset: number, flip: boolean): EmittedMesh {
    const n = this.grid.length;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.setIndex(this.index);
    return { geometry: g, grid: Int32Array.from(this.grid), quads: Int32Array.from(this.quads), offset, flip };
  }
}

/** Smoothing components of the (up to) 4 quads around grid vertex (r, c). */
function vertexComponents(grid: BodyGrid, info: QuadInfo, r: number, c: number): { quads: number[]; label: number[] } {
  const qr = grid.rows - 1;
  const at = (rr: number, cc: number) => (rr >= 0 && rr < qr && cc >= 0 && cc < info.qc ? rr * info.qc + cc : -1);
  const quads = [at(r - 1, c - 1), at(r - 1, c), at(r, c - 1), at(r, c)];
  const parent = [0, 1, 2, 3];
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const link = (a: number, b: number, hardCol: boolean) => {
    const qa = quads[a];
    const qb = quads[b];
    if (qa < 0 || qb < 0 || hardCol || info.mat[qa] !== info.mat[qb]) return;
    parent[find(b)] = find(a);
  };
  link(0, 1, r - 1 >= 0 && isHardColumn(grid, info, c, r - 1));
  link(2, 3, r < qr && isHardColumn(grid, info, c, r));
  link(0, 2, false);
  link(1, 3, false);
  return { quads, label: quads.map((_, i) => find(i)) };
}

function triangleArea(p: Float32Array, a: number, b: number, c: number): number {
  const ax = p[b * 3] - p[a * 3], ay = p[b * 3 + 1] - p[a * 3 + 1], az = p[b * 3 + 2] - p[a * 3 + 2];
  const bx = p[c * 3] - p[a * 3], by = p[c * 3 + 1] - p[a * 3 + 1], bz = p[c * 3 + 2] - p[a * 3 + 2];
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
}

type UVFn = (gv: number, q: number) => readonly [number, number];

/** Every `step`-th line from a to b, always including the `keep` lines inside the range. */
function stepped(a: number, b: number, step: number, keep: number[]): number[] {
  const set = new Set<number>([a, b]);
  for (let v = a; v < b; v += step) set.add(v);
  for (const k of keep) if (k > a && k < b) set.add(k);
  return [...set].sort((x, y) => x - y);
}

/**
 * Inward-facing cabin liner over grid rows r0..r1 and columns c0..c1, using a
 * coarse subset of the grid lines (cheap: it only has to stop the cabin looking
 * hollow). Lines on glass edges are kept so that no liner quad covers a window.
 */
function emitCoarse(e: Emitter, grid: BodyGrid, info: QuadInfo, r0: number, r1: number, c0: number, c1: number, step: number): void {
  const qr = grid.rows - 1;
  const around = (r: number, c: number) =>
    [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]].filter(([a, b]) => a >= 0 && b >= 0 && a < qr && b < info.qc).map(([a, b]) => a * info.qc + b);
  const id = (r: number, c: number) => {
    const gv = r * grid.cols + c;
    return e.vertex(gv * 64 + 63, gv, around(r, c), [0, 0]);
  };
  const at = grid.rowAt;
  const rs = stepped(r0, r1, step, [at.sideRear, at.sideFront, at.roofFront, at.roofRear, at.rearGlassBase, at.cowl]);
  const cpx = grid.layout.cpIndex;
  const cs = stepped(c0, c1, step, [...cpx, ...cpx.map((c) => 2 * grid.n - c)]);
  for (let i = 0; i < rs.length - 1; i++) {
    for (let j = 0; j < cs.length - 1; j++) {
      if (info.mat[rs[i] * info.qc + cs[j]] !== MAT_PAINT) continue;
      const a = id(rs[i], cs[j]), b = id(rs[i], cs[j + 1]), d = id(rs[i + 1], cs[j]), f = id(rs[i + 1], cs[j + 1]);
      e.index.push(a, d, b, b, d, f);
    }
  }
}

/** Emits quad q (row r, col c) into an emitter, optionally with reversed winding. */
function emitQuad(e: Emitter, grid: BodyGrid, info: QuadInfo, r: number, c: number, uvOf: UVFn, flip: boolean, cache: Map<number, ReturnType<typeof vertexComponents>>): void {
  const q = r * info.qc + c;
  const corner = [[r, c, 3], [r, c + 1, 2], [r + 1, c, 1], [r + 1, c + 1, 0]] as const;
  const ids = corner.map(([rr, cc, slot]) => {
    const gv = rr * grid.cols + cc;
    let comp = cache.get(gv);
    if (!comp) { comp = vertexComponents(grid, info, rr, cc); cache.set(gv, comp); }
    const label = comp.label[slot];
    const members = comp.quads.filter((_, i) => comp.label[i] === label);
    const key = gv * 64 + label * 8 + info.region[q];
    return { gv, idx: e.vertex(key, gv, members, uvOf(gv, q)) };
  });
  const tris = [[0, 1, 2], [1, 3, 2]];
  for (const t of tris) {
    const [a, b, d] = t.map((i) => ids[i]);
    if (triangleArea(grid.rest, a.gv, b.gv, d.gv) < 1e-9) continue;
    if (flip) e.index.push(a.idx, d.idx, b.idx);
    else e.index.push(a.idx, b.idx, d.idx);
  }
}

/** `cutFace`: leave out the flat nose face (it is replaced by the fascia mesh with real openings). */
export function buildBodyMeshes(grid: BodyGrid, withShell: boolean, cutFace = false): BodyMeshes {
  const info = classifyQuads(grid);
  const rest = grid.rest;
  const paint = new Emitter(), glass = new Emitter(), tinted = new Emitter(), dark = new Emitter(), banner = new Emitter(), shell = new Emitter();
  const cache = new Map<number, ReturnType<typeof vertexComponents>>();
  const atlasUV: UVFn = (gv, q) => {
    const region = REGIONS[info.region[q]];
    return regionUV(region, ...regionCoords(region, rest[gv * 3], rest[gv * 3 + 1], rest[gv * 3 + 2]));
  };
  const zTop = grid.rowZ[grid.rowAt.roofFront];
  const zLow = grid.rowZ[grid.rowAt.banner];
  const bannerUV: UVFn = (gv) => [(rest[gv * 3] + 0.8) / 1.6, (zLow - rest[gv * 3 + 2]) / (zLow - zTop)];
  const none: UVFn = () => [0, 0];
  const cp = grid.layout.cpIndex;
  const cabin = [grid.rowAt.rearGlassBase, grid.rowAt.cowl];
  for (let r = 0; r < grid.rows - 1; r++) {
    for (let c = 0; c < info.qc; c++) {
      const q = r * info.qc + c;
      const m = info.mat[q];
      if (cutFace && r >= grid.rowAt.noseFace) continue;
      if (m === MAT_PAINT) emitQuad(paint, grid, info, r, c, atlasUV, false, cache);
      // At low detail all glass shares one mesh (one draw call; it is opaque there anyway).
      else if (m === MAT_GLASS) emitQuad(info.glass[q] === GLASS_FRONT || !withShell ? glass : tinted, grid, info, r, c, none, false, cache);
      else if (m === MAT_DARK) emitQuad(dark, grid, info, r, c, none, false, cache);
      if (info.glass[q] === GLASS_FRONT && r < grid.rowAt.banner) emitQuad(banner, grid, info, r, c, bannerUV, false, cache);
    }
  }
  if (withShell) emitCoarse(shell, grid, info, cabin[0], cabin[1], cp[CP.S1], 2 * grid.n - cp[CP.S1], 3);
  const out: BodyMeshes = {
    paint: paint.build(0, false),
    glass: glass.build(0, false),
    tinted: tinted.build(0, false),
    dark: dark.build(0, false),
    banner: banner.build(0.004, false),
    shell: withShell ? shell.build(-0.014, true) : null,
    info,
    quadNormals: new Float32Array((grid.rows - 1) * info.qc * 3),
  };
  const colours = new Float32Array(out.paint.grid.length * 3).fill(1);
  out.paint.geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  refreshBodyMeshes(grid, out, rest);
  return out;
}

function computeQuadNormals(grid: BodyGrid, info: QuadInfo, pos: Float32Array, out: Float32Array): void {
  const cols = grid.cols;
  for (let r = 0; r < grid.rows - 1; r++) {
    for (let c = 0; c < info.qc; c++) {
      const i00 = (r * cols + c) * 3, i01 = (r * cols + c + 1) * 3, i10 = ((r + 1) * cols + c) * 3, i11 = ((r + 1) * cols + c + 1) * 3;
      const ax = pos[i11] - pos[i00], ay = pos[i11 + 1] - pos[i00 + 1], az = pos[i11 + 2] - pos[i00 + 2];
      const bx = pos[i10] - pos[i01], by = pos[i10 + 1] - pos[i01 + 1], bz = pos[i10 + 2] - pos[i01 + 2];
      const o = (r * info.qc + c) * 3;
      out[o] = ay * bz - az * by;
      out[o + 1] = az * bx - ax * bz;
      out[o + 2] = ax * by - ay * bx;
    }
  }
}

function refreshEmitted(m: EmittedMesh, pos: Float32Array, qn: Float32Array): void {
  const p = m.geometry.getAttribute('position') as THREE.BufferAttribute;
  const nAttr = m.geometry.getAttribute('normal') as THREE.BufferAttribute;
  const P = p.array as Float32Array;
  const N = nAttr.array as Float32Array;
  for (let i = 0; i < m.grid.length; i++) {
    let nx = 0, ny = 0, nz = 0;
    for (let k = 0; k < 4; k++) {
      const q = m.quads[i * 4 + k];
      if (q < 0) continue;
      nx += qn[q * 3]; ny += qn[q * 3 + 1]; nz += qn[q * 3 + 2];
    }
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
    const g = m.grid[i] * 3;
    P[i * 3] = pos[g] + nx * m.offset;
    P[i * 3 + 1] = pos[g + 1] + ny * m.offset;
    P[i * 3 + 2] = pos[g + 2] + nz * m.offset;
    const s = m.flip ? -1 : 1;
    N[i * 3] = nx * s; N[i * 3 + 1] = ny * s; N[i * 3 + 2] = nz * s;
  }
  p.needsUpdate = true;
  nAttr.needsUpdate = true;
  m.geometry.computeBoundingSphere();
  m.geometry.computeBoundingBox();
}

/** Rewrites positions and normals of all body meshes from grid positions `pos`. */
export function refreshBodyMeshes(grid: BodyGrid, meshes: BodyMeshes, pos: Float32Array): void {
  computeQuadNormals(grid, meshes.info, pos, meshes.quadNormals);
  for (const m of [meshes.paint, meshes.glass, meshes.tinted, meshes.dark, meshes.banner, meshes.shell]) if (m) refreshEmitted(m, pos, meshes.quadNormals);
}
