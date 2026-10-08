import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import { getGraphics, QUALITY } from '@/config/graphics';
import { rng, SpatialMask, yawFacingTrack } from '@/world/scenery/geo';
import type { Terrain } from '@/world/terrain';

export interface AdelaideFootprint { x: number; z: number; width: number; depth: number; yaw: number }
export interface AdelaideBuilding extends AdelaideFootprint { height: number; heritage: boolean; seed: number; district: 'street' | 'skyline' }
export interface AdelaideTree { x: number; z: number; radius: number; scale: number; variant: number; yaw: number }

/** Estimated surrounding architecture; the circuit survey remains the placement authority. */
export function adelaideFootprintFits(terrain: Pick<Terrain, 'clearance'>, p: AdelaideFootprint, margin = 2): boolean {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const nx = Math.max(2, Math.ceil(p.width / 6)), nz = Math.max(2, Math.ceil(p.depth / 6));
  // Sample the whole footprint: testing only four corners misses a road crossing its interior.
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const u = p.width * (i / nx - 0.5), v = p.depth * (j / nz - 0.5);
    if (terrain.clearance(p.x + c * u + s * v, p.z - s * u + c * v) < margin) return false;
  }
  return true;
}

/** Keep Victoria Park's broad central lawn open; tree belts frame the roads and park edges. */
export function adelaideOpenLawn(x: number, z: number): boolean {
  return x > -465 && x < -150 && z > -400 && z < -95;
}

export function adelaideCityPlacements(track: Track, terrain: Terrain, quality: QualityPreset): AdelaideBuilding[] {
  const out: AdelaideBuilding[] = [], random = rng(20261126), mask = new SpatialMask(30);
  const p: [number, number, number] = [0, 0, 0];
  const add = (building: AdelaideBuilding) => {
    if (!adelaideFootprintFits(terrain, building) || mask.blocked(building.x, building.z, Math.min(building.width, building.depth) / 2)) return;
    out.push(building); mask.add(building.x, building.z, Math.min(building.width, building.depth) * 0.55);
  };
  // Adelaide's eastern CBD edge: Hutt / Flinders streets and the north side of Bartels Road.
  // Façades, heights and setbacks are generated estimates, not surveyed individual buildings.
  for (let s = 725; s < 1830; s += 31) {
    const i = Math.floor(s / track.spacing), width = 21 + random() * 8, depth = 16 + random() * 9;
    pointAt(track, s, track.left.wall[i] + 8 + depth / 2, p);
    if (!(p[0] < -530 || p[2] < -570)) continue;
    add({ x: p[0], z: p[2], width, depth, yaw: yawFacingTrack(track, p[0], p[2]),
      height: 6 + random() * 7, heritage: true, seed: Math.round(s), district: 'street' });
  }
  const rows = quality === 'low' ? 1 : 2;
  for (let row = 0; row < rows; row++) for (let z = -800; z < -170; z += 67) {
    const x = -870 - row * 75 - random() * 22;
    add({ x, z, width: 34 + random() * 16, depth: 28 + random() * 9, yaw: Math.PI / 2,
      height: 10 + random() * 13, heritage: random() > 0.45, seed: Math.round(-z + row * 1000), district: 'street' });
  }
  // A restrained western skyline provides city silhouettes without filling the park with towers.
  const count = quality === 'low' ? 11 : quality === 'medium' ? 17 : 23;
  for (let i = 0; i < count; i++) {
    const x = -1090 - (i % 4) * 98 - random() * 45, z = -940 + Math.floor(i / 4) * 142 + random() * 55;
    add({ x, z, width: 32 + random() * 34, depth: 34 + random() * 24, yaw: 0,
      height: 30 + random() * 60, heritage: false, seed: 5000 + i, district: 'skyline' });
  }
  return out;
}

export function adelaideTreePlacements(track: Track, terrain: Terrain, quality: QualityPreset): AdelaideTree[] {
  const random = rng(1985), trees: AdelaideTree[] = [], mask = new SpatialMask(20);
  const density = Math.max(0, getGraphics().treeDensity) * QUALITY[quality].treeDensityScale;
  const p: [number, number, number] = [0, 0, 0];
  const add = (x: number, z: number) => {
    const scale = 0.82 + random() * 0.32, radius = 14 * scale;
    if (random() > Math.min(1, density) || terrain.clearance(x, z) <= radius + 1.5
      || mask.blocked(x, z, radius * 0.7) || adelaideOpenLawn(x, z)) return;
    trees.push({ x, z, radius, scale, variant: Math.floor(random() * 6), yaw: random() * Math.PI * 2 });
    mask.add(x, z, radius * 0.7);
  };
  // Regular boulevard trees, interrupted naturally at intersections and race facilities.
  for (let s = 350; s < 2410; s += 24) for (const side of [1, -1] as const) {
    const i = Math.floor(s / track.spacing), arr = side > 0 ? track.left : track.right;
    pointAt(track, s, side * (arr.wall[i] + 17 + random() * 4), p);
    if (p[0] < -815 || p[2] < -625) continue;
    add(p[0], p[2]);
  }
  // Loosely spaced parkland groups, never a dense mountain forest or campsite.
  for (let x = -560; x < 500; x += 41) for (let z = -520; z < 520; z += 42) {
    if (random() > 0.30) continue;
    const px = x + (random() - 0.5) * 22, pz = z + (random() - 0.5) * 22;
    if (px > -110 && px < 245 && pz > -265 && pz < 250) continue; // pit and park circuit loop
    add(px, pz);
  }
  return trees;
}
