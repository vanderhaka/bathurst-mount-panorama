import * as THREE from 'three';
import { PROP_VARIANTS } from '@/props/registry';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { GOLD_COAST_TRACKSIDE, HIGHWAY_HALF, TRAM_BED_HALF, TRAM_GAUGE, inWater, transitCentreDistance, type TransitWay } from '@/world/gold-coast-geo';
import { Soup, addPlatforms, buildTram, project, sample, stationSites, tangentAt, type Clear, type WayNode } from '@/world/gold-coast-tram';
import type { Terrain } from '@/world/terrain';

/** A road car standing on the public carriageway; the scenery instancer draws it. */
export interface TransitCar { x: number; y: number; z: number; yaw: number; variant: number; tint: number }

export interface GoldCoastTransit {
  group: THREE.Group;
  /** Cars on the public Gold Coast Highway carriageway (empty on the low tier). */
  cars: ReadonlyArray<TransitCar>;
  dispose(): void;
}

type Ground = Pick<Terrain, 'heightAt' | 'clearance'>;
interface Band { d0: number; d1: number; colour: number; minC: number; lift: number; shrink?: boolean; dash?: boolean }
// Off-deck paving floats LIFT over the analytic ground: the coarse terrain mesh can sit a few cm above it.
const DECK_Y = 0.02, LIFT = 0.06, RAIL_TOP = 0.035, STEP = 1.5, RAMP = 15;
const TINTS = [0xd9d9d6, 0x2b2f36, 0x8a1f1f, 0x1f3f6b, 0x9aa1a6, 0x5a5f4a];

/** Resamples a way to <= 1.5 m, with tangents, mitred normals, surface heights (ramped onto decks over 15 m) and wall clearance. */
function sampleWay(way: TransitWay, ground: Ground): WayNode[] {
  const nodes: WayNode[] = [], pts = way.points;
  const add = (x: number, z: number, s: number) => {
    const deck = way.bridge || inWater(x, z);
    nodes.push({ x, z, y: deck ? DECK_Y : ground.heightAt(x, z) + LIFT, s, deck, tx: 1, tz: 0, mx: 0, mz: -1, c: ground.clearance(x, z) });
  };
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / STEP));
    for (let k = 0; k < n; k++) add(ax + (bx - ax) * k / n, az + (bz - az) * k / n, s + len * k / n);
    s += len;
  }
  add(pts[pts.length - 1][0], pts[pts.length - 1][1], s);
  const dir = (i: number): [number, number] => {
    const a = nodes[i], b = nodes[i + 1], l = Math.hypot(b.x - a.x, b.z - a.z);
    return l < 1e-6 ? [1, 0] : [(b.x - a.x) / l, (b.z - a.z) / l];
  };
  nodes.forEach((nd, i) => {
    const a = dir(Math.max(0, i - 1)), b = dir(Math.min(nodes.length - 2, i)), l = Math.hypot(a[0] + b[0], a[1] + b[1]) || 1;
    nd.tx = (a[0] + b[0]) / l; nd.tz = (a[1] + b[1]) / l;
    const k = 1 / Math.max(0.5, nd.tz * b[1] + nd.tx * b[0]);
    nd.mx = nd.tz * k; nd.mz = -nd.tx * k;
  });
  const near = nodes.map(nd => (nd.deck ? 0 : Infinity));
  for (let i = 1; i < nodes.length; i++) near[i] = Math.min(near[i], near[i - 1] + nodes[i].s - nodes[i - 1].s);
  for (let i = nodes.length - 2; i >= 0; i--) near[i] = Math.min(near[i], near[i + 1] + nodes[i + 1].s - nodes[i].s);
  nodes.forEach((nd, i) => { if (!nd.deck) nd.y = DECK_Y + (nd.y - DECK_Y) * Math.min(1, near[i] / RAMP); });
  return nodes;
}

/** Flat strip between lateral offsets d0..d1 (+ = left of travel). Outer edges shrink in 0.1 m steps off the race wall; unsafe quads are skipped. */
function ribbon(soup: Soup, nodes: WayNode[], clear: Clear, b: Band): void {
  const cache: Array<[number, boolean, number, boolean]> = [];
  const edge = (nd: WayNode, d: number): [number, boolean] => {
    let a = Math.abs(d); const sg = d < 0 ? -1 : 1;
    const ok = (v: number) => nd.c - 2 * v - 1 >= b.minC || clear(nd.x + nd.mx * sg * v, nd.z + nd.mz * sg * v) >= b.minC;
    while (b.shrink && a > 0 && !ok(a)) a = Math.max(0, Math.round((a - 0.1) * 10) / 10);
    return [sg * a, ok(a)];
  };
  const edges = (i: number) => cache[i] ??= [...edge(nodes[i], b.d0), ...edge(nodes[i], b.d1)] as [number, boolean, number, boolean];
  const mid = (b.d0 + b.d1) / 2;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], c = nodes[i + 1];
    if (b.dash && ((a.s + c.s) / 2) % 9 >= 3) continue;
    const ea = edges(i), ec = edges(i + 1);
    if (!(ea[1] && ea[3] && ec[1] && ec[3]) || ea[2] - ea[0] < 1e-3 || ec[2] - ec[0] < 1e-3) continue;
    const mx = (a.x + c.x) / 2 + (a.mx + c.mx) / 2 * mid, mz = (a.z + c.z) / 2 + (a.mz + c.mz) / 2 * mid;
    if ((a.c + c.c) / 2 - 2 * Math.abs(mid) - 1 < b.minC && clear(mx, mz) < b.minC) continue;
    const p = (nd: WayNode, d: number) => [nd.x + nd.mx * d, nd.y + b.lift, nd.z + nd.mz * d];
    soup.quad(p(a, ea[0]), p(a, ea[2]), p(c, ec[2]), p(c, ec[0]), b.colour);
  }
}

/** Slab and parapets under and beside every deck stretch of a way. */
function addDeck(soup: Soup, nodes: WayNode[], half: number, depth: number): void {
  const w = 2 * half + 0.6;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i], b = nodes[i + 1];
    if (!(a.deck && b.deck) || Math.min(a.c, b.c) < half + 1) continue;
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), l = len || 1, yaw = Math.atan2(-dz, dx);
    const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, top = DECK_Y - 0.01;
    soup.box(len + 0.1, depth, w, x, top - depth / 2, z, yaw, 0x9a958b);
    for (const side of [-1, 1]) soup.box(len + 0.1, 1, 0.25, x + dz / l * side * (w / 2 - 0.125), top + 0.5, z - dx / l * side * (w / 2 - 0.125), yaw, 0xb4afa4);
  }
}

/** Overhead-line poles (single centre poles between close tracks, else side poles). Returns the pole count. */
function addPoles(soup: Soup, ways: WayNode[][], ground: Ground): number {
  const poles: Array<[number, number]> = [], cyl = new THREE.CylinderGeometry(0.11, 0.11, 7.2, 8, 1).toNonIndexed();
  const colour = 0x6f7377;
  const place = (x: number, z: number, ax: number, az: number, len: number, ay: number): void => {
    if (poles.some(q => Math.hypot(q[0] - x, q[1] - z) < 15) || ground.clearance(x, z) < 1 || transitCentreDistance(x, z).highway < HIGHWAY_HALF + 0.5) return;
    const y = ground.heightAt(x, z);
    poles.push([x, z]); soup.geo(cyl, x, y + 3.6, z, colour);
    soup.box(len, 0.1, 0.1, ax, y + 6.4, az, ay, colour);
  };
  ways.forEach((nodes, wi) => {
    for (let s = 10; s < nodes[nodes.length - 1].s; s += 35) {
      const q = sample(nodes, s);
      if (q.deck) continue;
      let o: ReturnType<typeof project> | null = null;
      ways.forEach((other, oi) => { const h = oi === wi ? null : project(other, q.x, q.z); if (h && h.d >= 2.5 && h.d <= 6 && (!o || h.d < o.d)) o = h; });
      const near = o as ReturnType<typeof project> | null;
      if (near) {
        const mx = (q.x + near.x) / 2, mz = (q.z + near.z) / 2;
        place(mx, mz, mx, mz, near.d + 1.2, Math.atan2(-(near.z - q.z), near.x - q.x));
        continue;
      }
      const nx = q.tz, nz = -q.tx, side = ground.clearance(q.x + nx * 5, q.z + nz * 5) >= ground.clearance(q.x - nx * 5, q.z - nz * 5) ? 1 : -1;
      place(q.x + nx * side * 2.4, q.z + nz * side * 2.4, q.x + nx * side * 1.2, q.z + nz * side * 1.2, 2.6, Math.atan2(-nz, nx));
    }
  });
  cyl.dispose();
  return poles.length;
}

/** Deterministic traffic on the three lanes of every highway way, in the direction of travel. */
function laneCars(ways: WayNode[][], clear: Clear): TransitCar[] {
  let seed = 4127;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const cars: TransitCar[] = [];
  for (const nodes of ways) for (const lane of [-3.7, 0, 3.7]) {
    const end = nodes[nodes.length - 1].s;
    for (let s = 18 + rand() * 42; s < end; s += 18 + rand() * 42) {
      const q = sample(nodes, s), x = q.x + q.tz * lane, z = q.z - q.tx * lane;
      if (s < 8 || s > end - 8 || q.deck || clear(x, z) < 2) continue;
      // The road-car prop's nose is local +Z, so yaw = atan2(heading x, heading z).
      cars.push({ x, y: q.y, z, yaw: Math.atan2(q.tx, q.tz), variant: Math.floor(rand() * PROP_VARIANTS.roadCar), tint: TINTS[Math.floor(rand() * TINTS.length)] });
    }
  }
  return cars;
}

/** The G:link light rail and the public Gold Coast Highway beside the circuit. */
export function buildGoldCoastTransit(_track: Track, terrain: Ground, quality: QualityPreset): GoldCoastTransit {
  const T = GOLD_COAST_TRACKSIDE, clear = terrain.clearance, full = quality !== 'low';
  const group = new THREE.Group(); group.name = 'gold-coast-transit';
  const roads = T.highway.map(w => sampleWay(w, terrain)), rails = T.tram.map(w => sampleWay(w, terrain));
  const flat = new Soup(), solid = new Soup(), g = HIGHWAY_HALF;
  for (const n of roads) {
    ribbon(flat, n, clear, { d0: -g, d1: g, colour: 0x4b4f52, minC: 0.65, lift: 0, shrink: true });
    for (const d of [-1.87, 1.87]) ribbon(flat, n, clear, { d0: d - 0.06, d1: d + 0.06, colour: 0xe8e6df, minC: 0.65, lift: 0.012, dash: true });
    for (const d of [-(g - 0.3), g - 0.3]) ribbon(flat, n, clear, { d0: d - 0.06, d1: d + 0.06, colour: 0xe8e6df, minC: 0.65, lift: 0.012 });
    addDeck(solid, n, g, 0.9);
  }
  for (const n of rails) {
    ribbon(flat, n, clear, { d0: -TRAM_BED_HALF, d1: TRAM_BED_HALF, colour: 0x8f8b82, minC: 0.25, lift: 0, shrink: true });
    for (const d of [-TRAM_GAUGE / 2, TRAM_GAUGE / 2]) ribbon(flat, n, clear, { d0: d - 0.035, d1: d + 0.035, colour: 0x6d6e70, minC: 0.15, lift: RAIL_TOP });
    addDeck(solid, n, TRAM_BED_HALF, 0.8);
  }
  addPoles(solid, rails, terrain);
  const sites = stationSites(rails, T.stations);
  addPlatforms(solid, rails, sites, clear, full);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  const mesh = (name: string, soup: Soup, cast: boolean) => {
    const m = new THREE.Mesh(soup.geometry(), material); m.name = name; m.castShadow = cast; m.receiveShadow = true; group.add(m);
  };
  mesh('gold-coast-transit-surface', flat, false); mesh('gold-coast-transit-structures', solid, true);
  const owned: Array<{ dispose(): void }> = [material];
  const cars: TransitCar[] = [];
  if (full) {
    const pos: number[] = [];
    for (const n of rails) for (let i = 0; i + 1 < n.length; i += 4) {
      const a = n[i], b = n[Math.min(i + 4, n.length - 1)];
      pos.push(a.x, a.y + RAIL_TOP + 5.9, a.z, b.x, b.y + RAIL_TOP + 5.9, b.z);
    }
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x2b2b2b }), wire = new THREE.BufferGeometry();
    wire.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(wire, wireMaterial); lines.name = 'gold-coast-transit-wire'; group.add(lines);
    owned.push(wireMaterial);
    for (const hits of sites) {
      const h = hits[0], [tx, tz] = tangentAt(rails[h.way], h.s, 1.5), tram = buildTram();
      tram.position.set(h.x, h.y + RAIL_TOP, h.z); tram.rotation.y = Math.atan2(-tz, tx); group.add(tram);
    }
    cars.push(...laneCars(roads, clear));
  }
  let disposed = false;
  return { group, cars, dispose() {
    if (disposed) return; disposed = true;
    group.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose(); });
    owned.forEach(o => o.dispose()); group.clear();
  } };
}
