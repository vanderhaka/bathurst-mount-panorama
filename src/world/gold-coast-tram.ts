import * as THREE from 'three';
import { StructureParts, V } from '@/props/structures/parts';
import { HIGHWAY_HALF, transitCentreDistance } from '@/world/gold-coast-geo';

/** One sampled point of a tram or highway way (~1.5 m spacing, world frame). `m*` is the mitred left offset vector, `c` the race-wall clearance. */
export interface WayNode { x: number; z: number; y: number; s: number; deck: boolean; tx: number; tz: number; mx: number; mz: number; c: number }
export interface Hit { way: number; d: number; s: number; x: number; z: number; y: number }
export type Clear = (x: number, z: number) => number;

// Box corner index = x + 2y + 4z (bit set = positive); two outward-facing triangles per face.
const BOX_TRIS = [1, 3, 7, 1, 7, 5, 0, 4, 6, 0, 6, 2, 2, 6, 7, 2, 7, 3, 0, 1, 5, 0, 5, 4, 4, 5, 7, 4, 7, 6, 0, 2, 3, 0, 3, 1];

/** Flat-shaded vertex-coloured triangle soup; local +X of a box maps to world (cos yaw, -sin yaw). */
export class Soup {
  private pos: number[] = []; private col: number[] = []; private colours = new Map<number, THREE.Color>();
  get triangles(): number { return this.pos.length / 9; }

  private push(p: ArrayLike<number>, colour: number): void {
    let c = this.colours.get(colour);
    if (!c) this.colours.set(colour, c = new THREE.Color(colour));
    this.pos.push(p[0], p[1], p[2]); this.col.push(c.r, c.g, c.b);
  }

  /** Quad a-b-c-d (x, y, z), wound so it faces up. */
  quad(a: number[], b: number[], c: number[], d: number[], colour: number): void {
    const up = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
    for (const i of up ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) this.push(i, colour);
  }

  box(sx: number, sy: number, sz: number, x: number, y: number, z: number, yaw: number, colour: number): void {
    const co = Math.cos(yaw), si = Math.sin(yaw), v: number[][] = [];
    for (let i = 0; i < 8; i++) {
      const lx = (i & 1 ? 0.5 : -0.5) * sx, lz = (i & 4 ? 0.5 : -0.5) * sz;
      v.push([x + lx * co + lz * si, y + (i & 2 ? 0.5 : -0.5) * sy, z - lx * si + lz * co]);
    }
    for (const i of BOX_TRIS) this.push(v[i], colour);
  }

  /** Adds a (translated) geometry such as a pole cylinder. */
  geo(g: THREE.BufferGeometry, x: number, y: number, z: number, colour: number): void {
    const flat = g.index ? g.toNonIndexed() : g, p = flat.getAttribute('position');
    for (let i = 0; i < p.count; i++) this.push([p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z], colour);
    if (flat !== g) flat.dispose();
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

/** Nearest point of a way polyline to (x, z): distance, arc length, position and surface height. */
export function project(nodes: WayNode[], x: number, z: number): Omit<Hit, 'way'> {
  let best = { d: Infinity, s: 0, x: 0, z: 0, y: 0 };
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], b = nodes[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    const d = Math.hypot(x - a.x - t * dx, z - a.z - t * dz);
    if (d < best.d) best = { d, s: a.s + t * (b.s - a.s), x: a.x + t * dx, z: a.z + t * dz, y: a.y + t * (b.y - a.y) };
  }
  return best;
}

/** Position, height and segment direction at arc length s (clamped to the way). */
export function sample(nodes: WayNode[], s: number): { x: number; y: number; z: number; tx: number; tz: number; deck: boolean } {
  let lo = 0, hi = nodes.length - 2;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (nodes[mid].s <= s) lo = mid; else hi = mid - 1; }
  const a = nodes[lo], b = nodes[lo + 1], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  const t = Math.max(0, Math.min(1, (s - a.s) / ((b.s - a.s) || 1)));
  return { x: a.x + t * dx, y: a.y + t * (b.y - a.y), z: a.z + t * dz, tx: dx / l, tz: dz / l, deck: a.deck || b.deck };
}

/** Unit direction of the chord between s - half and s + half. */
export function tangentAt(nodes: WayNode[], s: number, half: number): [number, number] {
  const p = sample(nodes, s - half), q = sample(nodes, s + half), l = Math.hypot(q.x - p.x, q.z - p.z);
  return l < 1e-6 ? [p.tx, p.tz] : [(q.x - p.x) / l, (q.z - p.z) / l];
}

/** Per station, the (at most two) tram ways passing within 30 m of the station node, nearest first. */
export function stationSites(ways: WayNode[][], stations: ReadonlyArray<{ x: number; z: number }>): Hit[][] {
  return stations.map(st => ways.map((nodes, way) => ({ way, ...project(nodes, st.x, st.z) }))
    .filter(h => h.d <= 30).sort((a, b) => a.d - b.d).slice(0, 2)).filter(h => h.length > 0);
}

/** Side platforms (and on medium/high a shelter each) on the far side of each station track; returns the platform count. */
export function addPlatforms(soup: Soup, ways: WayNode[][], sites: Hit[][], clearance: Clear, shelter: boolean): number {
  let count = 0;
  for (const hits of sites) hits.forEach((h, k) => {
    const [tx, tz] = tangentAt(ways[h.way], h.s, 20), nx = tz, nz = -tx, other = hits[1 - k];
    const side = other ? ((other.x - h.x) * nx + (other.z - h.z) * nz > 0 ? -1 : 1) : (clearance(h.x + nx * 5, h.z + nz * 5) >= clearance(h.x - nx * 5, h.z - nz * 5) ? 1 : -1);
    const at = (u: number, v: number): [number, number] => [h.x + tx * u + nx * side * v, h.z + tz * u + nz * side * v];
    const bad = [[-20, 1.45], [-20, 4.45], [20, 1.45], [20, 4.45], [0, 2.95]].some(([u, v]) => {
      const [x, z] = at(u, v);
      return clearance(x, z) < 1 || transitCentreDistance(x, z).highway < HIGHWAY_HALF + 0.5;
    });
    if (bad) return;
    const yaw = Math.atan2(-tz, tx), top = h.y + 0.3, put = (sx: number, sy: number, sz: number, u: number, v: number, y: number, c: number) => {
      const [x, z] = at(u, v); soup.box(sx, sy, sz, x, y, z, yaw, c);
    };
    put(40, 0.7, 3, 0, 2.95, top - 0.35, 0xa9a69c);
    put(40, 0.02, 0.15, 0, 1.55, top + 0.01, 0xd8c24a);
    count++;
    if (!shelter) return;
    put(8, 0.12, 2.4, 0, 3.2, top + 2.7 + 0.06, 0x4d5357);
    for (const u of [-3.7, 3.7]) for (const v of [2.2, 4.15]) put(0.1, 2.7, 0.1, u, v, top + 1.35, 0x4d5357);
    put(7.8, 1.9, 0.05, 0, 4.3, top + 1.15, 0x7fa0aa);
  });
  return count;
}

/** Generic 5-module low-floor tram, 43.5 m long: length along +X, centred at the origin, y = 0 at rail top. */
export function buildTram(): THREE.Group {
  const p = new StructureParts(), M = 8.5, G = 0.25, W = 2.65, F = 0.35, H = 3.3;
  const white = 0xe9ebe8, dark = 0x1f2a30, blue = 0x3a6f8f, grey = 0x25282b, roofGrey = 0xb9bcbc, steel = 0x2f3235;
  for (let i = 0; i < 5; i++) {
    const cx = -21.75 + M / 2 + i * (M + G), cab = i === 0 ? -1 : i === 4 ? 1 : 0, len = cab ? M - 1.2 : M, bx = cx - cab * 0.6;
    p.block(len, H, W, bx, F, 0, white);
    p.block(len, 0.35, W + 0.02, bx, F, 0, blue);
    p.block(len - 0.8, 1.5, W + 0.02, bx, F + 1, 0, dark);
    p.block(2.2, 0.3, 2, cx, 0.05, 0, grey);
    if (cab) for (const [k, w] of [[0.3, W * 0.9], [0.9, W * 0.7]]) {
      const x = bx + cab * (len / 2 + k);
      p.block(0.6, H, w, x, F, 0, white); p.block(0.6, 0.35, w + 0.02, x, F, 0, blue); p.block(0.5, 1.5, w + 0.02, x, F + 1, 0, dark);
      if (k > 0.5) p.block(0.06, 1.5, w - 0.1, x + cab * 0.31, F + 1, 0, dark);
    }
    if (i < 4) p.block(G, H - 0.3, W - 0.3, cx + M / 2 + G / 2, F, 0, grey);
    if (i === 1 || i === 3) p.block(2.4, 0.4, 1.4, cx, F + H, 0, roofGrey);
  }
  for (const z of [-0.5, 0.5]) { p.beam(V(-1, 3.7, z), V(0, 5.8, z), 0.03, steel); p.beam(V(0.9, 3.7, z), V(0, 5.8, z), 0.03, steel); }
  p.beam(V(0, 5.9, -0.6), V(0, 5.9, 0.6), 0.03, steel);
  return p.toGroup('gold-coast-tram');
}
