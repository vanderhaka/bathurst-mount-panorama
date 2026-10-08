import { getGraphics, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import { GOLD_COAST_ENV, coastXAt, inSea, inWater, onIsland, transitDistance } from '@/world/gold-coast-geo';
import type { TowerSpec, TowerStyle } from '@/world/gold-coast-towers';
import { rng } from '@/world/scenery/geo';
import type { Terrain } from '@/world/terrain';

export interface GoldCoastPalm { kind: 'palm'; variant: number; x: number; z: number; yaw: number; scale: number; radius: number }
type Footprint = { x: number; z: number; width: number; depth: number; yaw: number };

const BEACH = 55, Q1_ID = 188325694;

/** Samples the whole rotated rectangle (corners alone miss a road crossing the interior), the sea, the water and the beach. */
export function goldCoastFootprintFits(terrain: Pick<Terrain, 'clearance'>, p: Footprint, margin = 2, transitMargin = 1.0): boolean {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const nx = Math.max(2, Math.ceil(p.width / 6)), nz = Math.max(2, Math.ceil(p.depth / 6));
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const u = p.width * (i / nx - 0.5), v = p.depth * (j / nz - 0.5), x = p.x + c * u + s * v, z = p.z - s * u + c * v;
    if (terrain.clearance(x, z) < margin || inSea(x, z) || inWater(x, z) || x > coastXAt(z) - BEACH || transitDistance(x, z) < transitMargin) return false;
  }
  return true;
}

/** Even-odd containment in the track centreline polygon. */
export function insideLap(track: Track, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = track.n - 1; i < track.n; j = i++) {
    const xi = track.px[i], zi = track.pz[i], xj = track.px[j], zj = track.pz[j];
    if ((zi > z) !== (zj > z) && x < xi + (xj - xi) * (z - zi) / (zj - zi)) inside = !inside;
  }
  return inside;
}

/** Direction of the coastline segment at z (yaw convention atan2(dx, dz)). */
function coastYaw(z: number): number {
  const c = GOLD_COAST_ENV.coastline;
  let i = 1;
  while (i < c.length - 1 && c[i][1] < z) i++;
  return Math.atan2(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1]);
}

function towerSize(h: number, q1: boolean): [number, number] {
  return q1 ? [42, 32] : h < 45 ? [20, 16] : h < 100 ? [26, 20] : h < 200 ? [32, 26] : [38, 30];
}

const crowded = (a: Footprint, b: Footprint, gap: number) =>
  Math.hypot(a.x - b.x, a.z - b.z) < (Math.min(a.width, a.depth) + Math.min(b.width, b.depth)) / 2 + gap;

/** The centre or any footprint corner on Macintosh Island. */
function touchesIsland(f: Footprint): boolean {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  return onIsland(f.x, f.z) || [[-1, -1], [-1, 1], [1, -1], [1, 1]].some(([a, b]) => {
    const u = a * f.width / 2, v = b * f.depth / 2;
    return onIsland(f.x + c * u + s * v, f.z - s * u + c * v);
  });
}

/** One tower per OSM building that fits; tall ones are placed first so the landmarks win any overlap. */
export function goldCoastTowerSpecs(track: Track, terrain: Terrain, quality: QualityPreset): TowerSpec[] {
  const out: TowerSpec[] = [];
  const list = GOLD_COAST_ENV.buildings.map(b => ({ b, h: b.heightM ?? b.levels * 3.2 + 3 })).sort((a, c) => c.h - a.h || a.b.osmId - c.b.osmId);
  for (const { b, h } of list) {
    const i = track.nearestIndex(b.x, b.z), near = Math.hypot(track.px[i] - b.x, track.pz[i] - b.z);
    if (quality === 'low' && h < 60 && near > 500) continue;
    const seed = b.osmId % 9973, [w, d] = towerSize(h, b.osmId === Q1_ID);
    const yaw = (near < 150 ? Math.atan2(track.tx[i], track.tz[i]) : coastYaw(b.z)) + (seed % 2 ? Math.PI / 2 : 0);
    const style: TowerStyle = h >= 150 || seed % 5 === 0 ? 'glass' : seed % 3 === 0 ? 'concrete' : 'balcony';
    let spec: TowerSpec = { x: b.x, z: b.z, width: w, depth: d, height: h, yaw, style, seed };
    if (!goldCoastFootprintFits(terrain, spec, 4)) {
      spec = { ...spec, width: w * 0.7, depth: d * 0.7 };
      if (!goldCoastFootprintFits(terrain, spec, 4)) continue;
    }
    if (!out.some(o => crowded(o, spec, 1))) out.push(spec);
  }
  return out;
}

/** Mid-rise street infill: 3-7 floors set back from the barrier on the outer side of the lap. */
export function goldCoastInfillSpecs(track: Track, terrain: Terrain, quality: QualityPreset, towers: readonly TowerSpec[]): TowerSpec[] {
  if (quality === 'low') return [];
  const out: TowerSpec[] = [], random = rng(70421), p: [number, number, number] = [0, 0, 0];
  let kept = 0;
  for (let s = 0; s < track.length; s += 28) for (const side of [1, -1] as const) {
    const floors = 3 + Math.floor(random() * 5), width = 18 + random() * 8, depth = 14 + random() * 6, style = random() < 0.5 ? 'concrete' : 'balcony';
    const i = Math.floor(s / track.spacing), wall = (side > 0 ? track.left : track.right).wall[i];
    pointAt(track, s, side * (wall + 14 + depth / 2), p);
    const spec: TowerSpec = { x: p[0], z: p[2], width, depth, height: floors * 3.2 + 1.5, yaw: Math.atan2(track.tx[i], track.tz[i]), style, seed: 9000 + out.length };
    if (p[0] > coastXAt(p[2]) - 120 || insideLap(track, p[0], p[2]) || !goldCoastFootprintFits(terrain, spec, 3) || touchesIsland(spec)) continue;
    if (towers.some(t => Math.hypot(t.x - p[0], t.z - p[2]) < 25) || out.some(o => crowded(o, spec, 0))) continue;
    if (quality === 'medium' && kept++ % 2) continue;
    out.push(spec);
  }
  return out;
}

/** Palm rows, beachfront coconut park and infield island park; every placement is on land, outside the wall line. */
export function goldCoastPalmPlacements(track: Track, terrain: Terrain, quality: QualityPreset): GoldCoastPalm[] {
  const out: GoldCoastPalm[] = [], random = rng(5471), p: [number, number, number] = [0, 0, 0], tp = createTrackPoint();
  const density = Math.max(0, getGraphics().treeDensity) * QUALITY[quality].treeDensityScale;
  const add = (variant: number, x: number, z: number): boolean => {
    if (terrain.clearance(x, z) < 1.5 || inSea(x, z) || inWater(x, z)) return false;
    const coconut = variant < 4;
    out.push({ kind: 'palm', variant, x, z, yaw: random() * Math.PI * 2, scale: 0.85 + random() * 0.3, radius: coconut ? 3 : 2 });
    return true;
  };
  const wallAt = (s: number, side: 1 | -1) => (side > 0 ? track.left : track.right).wall[Math.floor(track.wrapS(s) / track.spacing)];
  const coconut = () => Math.floor(random() * 4), foxtail = () => 4 + Math.floor(random() * 2);
  const row = (from: number, to: number, step: number, side: 1 | -1, offset: (s: number) => number, variant: () => number) => {
    let k = 0;
    for (let s = from; s <= to; s += step) {
      pointAt(track, s, side * offset(s), p);
      if (quality === 'low' && k++ % 2) continue;
      add(variant(), p[0], p[2]);
    }
  };
  row(-290, 285, 12, 1, () => 13.3, coconut);
  row(-290, 285, 18, 1, () => 25.5, foxtail);
  row(800, 1900, 16, -1, s => wallAt(s, -1) + 6, coconut);
  row(1940, 2560, 24, 1, s => wallAt(s, 1) + 5, foxtail); row(1940, 2560, 24, -1, s => wallAt(s, -1) + 5, foxtail);
  row(440, 790, 24, 1, s => wallAt(s, 1) + 5, foxtail); row(440, 790, 24, -1, s => wallAt(s, -1) + 5, foxtail);
  // Beachfront park between Main Beach Parade and the sand.
  let target = Math.round(60 * density);
  for (let tries = 0; target > 0 && tries < 4000; tries++) {
    const s = 800 + random() * 1100, d = wallAt(s, -1) + 10 + random() * 190;
    pointAt(track, s, -d, p);
    if (p[0] > coastXAt(p[2]) - BEACH) continue;
    if (add(coconut(), p[0], p[2])) target--;
  }
  // Infield island park, clear of the pit lane and garages.
  target = Math.round(40 * density);
  const x0 = Math.min(...track.px), x1 = Math.max(...track.px), z0 = Math.min(...track.pz), z1 = Math.max(...track.pz);
  for (let tries = 0; target > 0 && tries < 6000; tries++) {
    const x = x0 + random() * (x1 - x0), z = z0 + random() * (z1 - z0), mixed = random() < 0.5;
    if (!insideLap(track, x, z) || terrain.clearance(x, z) < 12 || inSea(x, z) || inWater(x, z)) continue;
    projectToTrack(track, x, z, -1, tp);
    if (tp.d > 10 && tp.d < 60 && (tp.s <= 320 || tp.s >= track.length - 320)) continue;
    if (add(mixed ? coconut() : foxtail(), x, z)) target--;
  }
  return out;
}
