import featuresJson from '@/track/data/features.json';
import { getGraphics, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import { FOLIAGE, GROUND } from '@/art/palette';
import { PROP_VARIANTS } from '@/props';

import { DEM_EXTENT, demHeight, fbm } from '@/world/dem';
import type { Terrain } from '@/world/terrain';
import { pointInPolygon, rng, type SpatialMask, type XZ } from '@/world/scenery/geo';
import type { PropInstancer } from '@/world/scenery/instancer';
import { addEmbeddedRock } from '@/world/scenery/rock-place';
import { placeUnderTreeDetails } from '@/world/scenery/undergrowth';

const F = featuresJson as unknown as { woods: Array<{ kind: string; poly: XZ[] }>; trees: XZ[]; treeRows: XZ[][]; grassland: XZ[][]; buildings: Array<{ kind: string; poly: XZ[] }> };

/** Pines are planted windbreaks: only near houses and sheds, never in the native bush. */
const homes = (() => {
  const m = new Map<number, boolean>();
  for (const b of F.buildings) {
    if (b.kind !== 'house' && b.kind !== 'shed' && b.kind !== 'generic') continue;
    const [x, z] = b.poly[0];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) m.set((Math.floor(x / 60) + i) * 100003 + Math.floor(z / 60) + j, true);
  }
  return m;
})();
function nearHomes(x: number, z: number): boolean {
  return homes.has(Math.floor(x / 60) * 100003 + Math.floor(z / 60));
}

/** Woodland density 0..1 at a point: patchy grassy woodland, denser on slopes and in mapped woods. */
function woodlandDensity(x: number, z: number, slope: number, height: number, woods: Array<{ poly: XZ[]; bbox: number[] }>, open: Array<{ poly: XZ[]; bbox: number[] }>): number {
  const n1 = fbm(x / 320, z / 320, 3, 21);
  const n2 = fbm(x / 70, z / 70, 2, 22);
  // Clumps and clearings (stands of gums with open grass between), denser on slopes.
  const clump = smoothstep01((n1 + 0.05) / 0.45);
  let d = 0.02 + clump * 0.55 + n2 * 0.1;
  d += Math.min(0.3, slope * 1.4);
  // Woodland belongs to the mountain top and the steep sides; the low ground (below
  // about 760 m) is paddock and acreage with scattered trees.
  const upland = smoothstep01((height - 55) / 40);
  d *= 0.22 + 0.78 * Math.max(upland, Math.min(1, slope * 3));
  for (const w of woods) {
    if (x < w.bbox[0] || x > w.bbox[2] || z < w.bbox[1] || z > w.bbox[3]) continue;
    if (pointInPolygon(x, z, w.poly)) return 0.85;
  }
  // Mapped grassland and meadows are open paddock: a scattered tree at most.
  for (const g of open) {
    if (x < g.bbox[0] || x > g.bbox[2] || z < g.bbox[1] || z > g.bbox[3]) continue;
    if (pointInPolygon(x, z, g.poly)) return Math.min(d, 0.06);
  }
  return Math.max(0, Math.min(1, d));
}

function smoothstep01(u: number): number {
  const c = Math.max(0, Math.min(1, u));
  return c * c * (3 - 2 * c);
}

/** Mature gum variant: the dead stag (variant 6) is rare, about 2 % of trees. */
function gumVariant(r: () => number, count: number): number {
  const v = Math.floor(r() * count);
  return v === 6 && r() > 0.16 ? Math.floor(r() * 6) : v;
}

function bbox(poly: XZ[]): number[] {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of poly) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return [x0, z0, x1, z1];
}

/** Places eucalypts, pines, shrubs, rocks and grass tufts. `mask` holds buildings, camp pitches, roads. */
export function placeVegetation(terrain: Terrain, inst: PropInstancer, mask: SpatialMask, densityScale: number, quality: QualityPreset = 'high'): number {
  const g = getGraphics();
  const tier = QUALITY[quality];
  let undergrowth = 0;
  const plantGum = (kind: 'eucalyptus' | 'eucalyptusYoung', variant: number, x: number, y: number, z: number, yaw: number, scale: number, colour?: number) => {
    const asset = inst.add(kind, variant, x, y, z, yaw, scale, colour);
    const seed = Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663);
    undergrowth += placeUnderTreeDetails(terrain, inst, mask, { x, z, yaw, scale, radius: asset.radius, seed }, {
      enabled: g.woodlandUndergrowth && tier.woodlandUndergrowth, density: g.woodlandDensity, capacity: tier.woodlandCapacity - undergrowth,
    });
  };
  const r = rng(1234);
  const woods = F.woods.map((w) => ({ poly: w.poly, bbox: bbox(w.poly) }));
  const open = F.grassland.filter((p) => p.length > 3).map((p) => ({ poly: p, bbox: bbox(p) }));
  const { x0, z0, x1, z1 } = terrain.box;
  const step = 10;
  let count = 0;
  const eucV = PROP_VARIANTS.eucalyptus, youngV = PROP_VARIANTS.eucalyptusYoung, pineV = PROP_VARIANTS.pine;
  const shrubV = PROP_VARIANTS.shrub, rockV = PROP_VARIANTS.rock, tuftV = PROP_VARIANTS.grassTuft;
  const slopeAt = (x: number, z: number) => {
    const h = terrain.heightAt(x, z);
    return Math.hypot(terrain.heightAt(x + 4, z) - h, terrain.heightAt(x, z + 4) - h) / 4;
  };
  for (let x = x0; x < x1; x += step) {
    for (let z = z0; z < z1; z += step) {
      const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
      const clear = terrain.clearance(px, pz);
      if (clear < 2.5) continue;
      if (mask.blocked(px, pz, 2)) continue;
      const slope = slopeAt(px, pz);
      let dens = woodlandDensity(px, pz, slope, terrain.heightAt(px, pz), woods, open) * densityScale * g.treeDensity;
      // Groves and gaps (about 50 m): gums stand in clusters, not on an even grid.
      dens *= 0.3 + 1.2 * smoothstep01((fbm(px / 45, pz / 45, 2, 91) + 0.08) / 0.45);
      // Thin out towards the edge of the detailed area, to meet the sparse far trees (no hard rectangle).
      const boxEdge = Math.min(px - x0, x1 - px, pz - z0, z1 - pz) + fbm(px / 180, pz / 180, 2, 35) * 120;
      dens *= 0.3 + 0.7 * Math.max(0, Math.min(1, boxEdge / 450));
      dens *= Math.min(1, 0.35 + (clear - 2.5) / 12);
      const y = terrain.heightAt(px, pz) - 0.15;
      // Cut faces (The Cutting) are bare rock and clay: a few boulders, no trees.
      if (slope > 0.8) {
        if (r() < 0.6) addEmbeddedRock(inst, terrain, Math.floor(r() * rockV), px, pz, r() * Math.PI * 2, 1.2 + r() * 2);
        continue;
      }
      const roll = r();
      if (roll < dens * 0.62) {
        const t = r();
        if (t < 0.84) plantGum('eucalyptus', gumVariant(r, eucV), px, y, pz, r() * Math.PI * 2, 0.78 + r() * 0.5, tint(r(), FOLIAGE.eucalyptA));
        else if (t < 0.96) plantGum('eucalyptusYoung', Math.floor(r() * youngV), px, y, pz, r() * Math.PI * 2, 0.8 + r() * 0.5);
        else if (nearHomes(px, pz)) inst.add('pine', Math.floor(r() * pineV), px, y, pz, r() * Math.PI * 2, 0.85 + r() * 0.4);
        else plantGum('eucalyptus', gumVariant(r, eucV), px, y, pz, r() * Math.PI * 2, 0.9 + r() * 0.4, tint(r(), FOLIAGE.eucalyptA));
        count++;
      } else if (roll < dens * 0.62 + dens * 0.25) {
        inst.add('shrub', Math.floor(r() * shrubV), px, y + 0.1, pz, r() * Math.PI * 2, 0.7 + r() * 0.8);
      } else if (roll > 0.985 && slope > 0.12) {
        addEmbeddedRock(inst, terrain, Math.floor(r() * rockV), px, pz, r() * Math.PI * 2, 0.6 + r() * 1.4);
      }
      // Grass tufts close to the track (seen from the cockpit), sparse elsewhere.
      const tuftP = (clear < 40 ? 0.55 : 0.06) * g.grassTuftDensity * densityScale;
      if (r() < tuftP) inst.add('grassTuft', Math.floor(r() * tuftV), px + (r() - 0.5) * 4, y + 0.12, pz + (r() - 0.5) * 4, r() * 6.28, 0.8 + r() * 0.8, tint(r(), GROUND.grassLight));
    }
  }
  // Individually mapped trees and tree rows (Mountain Straight, Conrod).
  for (const [x, z] of F.trees) {
    if (terrain.clearance(x, z) < 2) continue;
    inst.add('eucalyptus', Math.floor(r() * eucV), x, terrain.heightAt(x, z) - 0.15, z, r() * 6.28, 0.9 + r() * 0.3);
    count++;
  }
  for (const row of F.treeRows) {
    for (let k = 0; k < row.length - 1; k++) {
      const [ax, az] = row[k], [bx, bz] = row[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < len; d += 9) {
        const x = ax + ((bx - ax) * d) / len, z = az + ((bz - az) * d) / len;
        if (terrain.clearance(x, z) < 2) continue;
        inst.add(r() < 0.3 && nearHomes(x, z) ? 'pine' : 'eucalyptus', Math.floor(r() * 3), x, terrain.heightAt(x, z) - 0.15, z, r() * 6.28, 0.85 + r() * 0.3);
        count++;
      }
    }
  }
  count += placeFarTrees(inst, terrain, densityScale);
  return count;
}

/** Sparse paddock trees and windbreaks on the landscape beyond the detailed area (low detail at range). */
function placeFarTrees(inst: PropInstancer, terrain: Terrain, densityScale: number): number {
  const r = rng(99);
  const far = DEM_EXTENT.near; // stay within the 4.8 km detailed DEM
  const half = far.size / 2;
  let count = 0;
  for (let x = far.cx - half; x < far.cx + half; x += 32) {
    for (let z = far.cz - half; z < far.cz + half; z += 32) {
      const px = x + (r() - 0.5) * 28, pz = z + (r() - 0.5) * 28;
      const { x0, z0, x1, z1 } = terrain.box;
      if (px > x0 && px < x1 && pz > z0 && pz < z1) continue;
      const n = fbm(px / 400, pz / 400, 3, 31);
      // Fade out over the last 900 m of the detailed DEM (no straight edge where trees stop);
      // beyond it the landscape colours carry the windbreaks and stands.
      const edge = Math.min(px - (far.cx - half), far.cx + half - px, pz - (far.cz - half), far.cz + half - pz);
      const fade = Math.max(0, Math.min(1, (edge - 100 + fbm(px / 300, pz / 300, 2, 33) * 300) / 900));
      // Denser next to the detailed area, to meet its thinned edge.
      const toBox = Math.max(x0 - px, px - x1, z0 - pz, pz - z1);
      const near = 1 + 1.6 * Math.max(0, 1 - toBox / 500);
      const p = Math.max(0, n - 0.05) * 0.9 * fade * near * densityScale * getGraphics().treeDensity;
      if (r() > p) continue;
      inst.add('eucalyptus', Math.floor(r() * 4), px, demHeight(px, pz) - 0.2, pz, r() * 6.28, 0.8 + r() * 0.4);
      count++;
    }
  }
  return count;
}

/** Hue multipliers (≤ 1): neutral, blue-grey "silver" gum, warm olive, deep green. */
const HUES: Array<[number, number, number]> = [[1, 1, 1], [0.86, 0.94, 1], [1, 0.95, 0.76], [0.84, 0.95, 0.8]];

function tint(k: number, _base: number): number {
  // Per-tree brightness and hue (instance colour multiplies the vertex colours).
  // The hue comes from a hash of k so that the random sequence stays the same.
  const v = 0.82 + k * 0.18;
  const hue = HUES[Math.floor((k * 7919) % 1 * HUES.length)];
  const ch = (m: number) => Math.round(Math.min(1, v * m) * 255);
  return (ch(hue[0]) << 16) | (ch(hue[1]) << 8) | ch(hue[2]);
}
