import * as THREE from 'three';
import { GROUND } from '@/art/palette';
import { linearColour } from '@/art/materials';
import { getGraphics, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, projectToTrack, sampleArray } from '@/track/track-query';
import { DEM_EXTENT, demHeight, fbm } from '@/world/dem';
import { bakeHeightFieldAo } from '@/art/ambient-occlusion';
import { createTerrainMaterial, disposeTerrainMaterial } from '@/world/terrain-detail';
import { createTerrainSurfaceSampler, prepareTerrainGeometry, terrainSplat, terrainSurfaceColour } from '@/world/terrain-surface';
import { createNearGrass, type NearGrass } from '@/world/near-grass';
import { createCorridorMask } from '@/world/corridor-mask';

const FINE_CELL = 6;
const COARSE_CELL = 60;
const CHUNK_CELLS = 64;
const MARGIN = 240;
/** Terrain stays this far below the drawn verge inside the track corridor. */
const CORRIDOR_SINK = 0.7;
const BLEND = 30;
/** Beyond this distance past the barrier the terrain is the natural ground (no projection needed). */
const NATURAL_BEYOND_WALL = 1.5 + BLEND + 5;
/** The Cutting: the road is cut into the hillside, so the bank rises steeply right behind the wall. */
const CUT = { from: 1780, to: 2140, ramp: 50, blend: 6 };

/** 0..1: how much track position s lies inside The Cutting. */
function cutWeight(s: number): number {
  return smooth(Math.min(s - CUT.from + CUT.ramp, CUT.to + CUT.ramp - s) / CUT.ramp);
}

/** Blend width (m) from the wall to the natural ground at track position s, on the uphill side. */
function cutBlend(s: number): number {
  return BLEND + (CUT.blend - BLEND) * cutWeight(s);
}

export interface Terrain {
  group: THREE.Group;
  /** Terrain surface height at world x/z (the same function the mesh uses). */
  heightAt(x: number, z: number): number;
  /** Distance from the nearest barrier (m, negative = inside the track corridor). */
  clearance(x: number, z: number): number;
  box: { x0: number; z0: number; x1: number; z1: number };
  grass: NearGrass;
  dispose(): void;
}

/** Builds the carved fine terrain around the circuit and the coarse landscape to the horizon. */
export function buildTerrain(track: Track, material?: THREE.Material, quality: QualityPreset = 'high'): Terrain {
  const tp = createTrackPoint();
  const noiseAmp = 1.2;
  const box = fineBox(track);
  const fineEdgeFade = (x: number, z: number) => Math.min(1, Math.min(x - box.x0, box.x1 - x, z - box.z0, box.z1 - z) / 120);

  const corridorAt = (x: number, z: number, hint: number) => {
    projectToTrack(track, x, z, hint, tp);
    const side = tp.d >= 0 ? track.left : track.right;
    const wall = sampleArray(track, side.wall, tp.index, tp.t);
    return { dist: Math.abs(tp.d), wall, edge: sampleArray(track, side.edge, tp.index, tp.t), d: tp.d, index: tp.index, t: tp.t, cut: cutWeight((tp.index + tp.t) * track.spacing) };
  };
  // Meshes and grass: no search hint, so a projection depends on the point alone and the vertices that
  // neighbouring chunks share (and the samples either side of a normal) agree in any build order.
  const corridor = (x: number, z: number) => corridorAt(x, z, -1);
  const natural = (x: number, z: number) => demHeight(x, z) + fbm(x / 70, z / 70, 3, 11) * noiseAmp * fineEdgeFade(x, z);
  const carved = (c: ReturnType<typeof corridor>, x: number, z: number): number => {
    const dem = natural(x, z);
    if (c.dist > c.wall + NATURAL_BEYOND_WALL) return dem;
    const sign = c.d >= 0 ? 1 : -1;
    if (c.dist < c.wall + 1.5) return heightAt(track, c.index, c.t, c.d) - CORRIDOR_SINK;
    const atWall = heightAt(track, c.index, c.t, sign * c.wall) - 0.15;
    const blend = dem > atWall ? cutBlend((c.index + c.t) * track.spacing) : BLEND;
    const u = smooth((c.dist - c.wall - 1.5) / blend);
    return atWall + (dem - atWall) * u;
  };
  // Most of the box is open country: skip the (global) track projection where the corridor cannot reach.
  const mayCarve = createCorridorMask(track, box, widestWall(track) + NATURAL_BEYOND_WALL);
  const heightFn = (x: number, z: number): number => (mayCarve(x, z) ? carved(corridor(x, z), x, z) : natural(x, z));
  // Scenery queries keep the original hint-chained search: placement draws every tree and building from one
  // random stream, so a single changed answer would reshuffle the whole layout. The chain starts where the
  // original build left it (its last projection, the far box corner, always takes the global search).
  let hint = projectToTrack(track, box.x1, box.z1, -1, createTrackPoint()).index;
  const queryCorridor = (x: number, z: number) => { const c = corridorAt(x, z, hint); hint = c.index; return c; };

  const cfg = getGraphics(), tier = QUALITY[quality];
  const owned = material ? null : createTerrainMaterial({ enabled: cfg.terrainDetail && tier.terrainDetail,
    size: tier.terrainMapSize, normalStrength: cfg.terrainNormalStrength, mownStrength: cfg.mownStrength });
  const mat = material ?? owned!;
  const group = new THREE.Group();
  group.name = 'terrain';
  const nx = Math.round((box.x1 - box.x0) / FINE_CELL);
  const nz = Math.round((box.z1 - box.z0) / FINE_CELL);
  for (let cz = 0; cz < nz; cz += CHUNK_CELLS) {
    for (let cx = 0; cx < nx; cx += CHUNK_CELLS) {
      const w = Math.min(CHUNK_CELLS, nx - cx), h = Math.min(CHUNK_CELLS, nz - cz);
      const geo = gridGeometry(box.x0 + cx * FINE_CELL, box.z0 + cz * FINE_CELL, w, h, FINE_CELL, heightFn, (x, z) => corridor(x, z), fineEdgeFade, tier.bakedAo ? cfg.bakedAo : 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.receiveShadow = true;
      mesh.name = `terrain-fine-${cx}-${cz}`;
      group.add(mesh);
    }
  }
  // Coarse landscape: 16 km, sunk below the fine terrain inside the fine box.
  const far = DEM_EXTENT.far;
  const half = Math.floor(far.size / 2 / COARSE_CELL) * COARSE_CELL;
  const ox = Math.round(far.cx / COARSE_CELL) * COARSE_CELL - half;
  const oz = Math.round(far.cz / COARSE_CELL) * COARSE_CELL - half;
  const cn = Math.round((half * 2) / COARSE_CELL);
  const coarseH = (x: number, z: number) => {
    const inside = x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1;
    const edge = Math.max(Math.abs(x - far.cx), Math.abs(z - far.cz)) / half;
    const skirt = edge > 0.97 ? (edge - 0.97) * 4000 : 0;
    return demHeight(x, z) - (inside ? 60 : 0) - skirt; // well under the detailed terrain, which covers the box
  };
  const coarse = new THREE.Mesh(gridGeometry(ox, oz, cn, cn, COARSE_CELL, coarseH, null, undefined, tier.bakedAo ? cfg.bakedAo : 0), mat);
  coarse.receiveShadow = true;
  coarse.name = 'terrain-coarse';
  group.add(coarse);
  const grass = createNearGrass(createTerrainSurfaceSampler(track, heightFn), {
    enabled: cfg.nearGrass && tier.nearGrass, capacity: tier.grassCapacity, radius: tier.grassRadius,
    density: cfg.grassTuftDensity, wind: cfg.grassWind,
  });
  let disposed = false;

  return {
    group, grass,
    dispose: () => { if (disposed) return; disposed = true; grass.dispose(); if (owned) disposeTerrainMaterial(owned); },
    heightAt: (x, z) => (x > box.x0 && x < box.x1 && z > box.z0 && z < box.z1 ? carved(queryCorridor(x, z), x, z) : demHeight(x, z)),
    clearance: (x, z) => {
      const c = queryCorridor(x, z);
      return c.dist - c.wall;
    },
    box,
  };
}

function fineBox(track: Track) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < track.n; i++) {
    x0 = Math.min(x0, track.px[i]); x1 = Math.max(x1, track.px[i]);
    z0 = Math.min(z0, track.pz[i]); z1 = Math.max(z1, track.pz[i]);
  }
  const snap = (v: number, up: boolean) => (up ? Math.ceil(v / COARSE_CELL) : Math.floor(v / COARSE_CELL)) * COARSE_CELL;
  return { x0: snap(x0 - MARGIN, false), x1: snap(x1 + MARGIN, true), z0: snap(z0 - MARGIN, false), z1: snap(z1 + MARGIN, true) };
}

function widestWall(track: Track): number {
  let widest = 0;
  for (let i = 0; i < track.n; i++) widest = Math.max(widest, track.left.wall[i], track.right.wall[i]);
  return widest;
}

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

const C = {
  grassLight: linearColour(GROUND.grassLight),
  grass: linearColour(GROUND.grass),
  grassDark: linearColour(GROUND.grassDark),
  dry: linearColour(GROUND.grassDry),
  clay: linearColour(GROUND.clay),
  rock: linearColour(GROUND.rock),
};
/** Rock and clay layers of the cut face at The Cutting (repeat every 1.2 m of height). */
const STRATA = [linearColour(0x8a7d6e), linearColour(0xa2643a), linearColour(0x6c6258), linearColour(0x93715a)];
/** Normal-based slope (1 - n.y) above which a bank shows clay, and above which it shows rock. */
const CLAY_SLOPE = 0.09, ROCK_SLOPE = 0.17;

const FIELD = {
  lush: linearColour(0x6f8a42),
  pale: linearColour(0x9aa65e),
  golden: linearColour(0xb8a465),
  ploughed: linearColour(0x8a6a4a),
  crop: linearColour(0x56713a),
  townA: linearColour(0x8f8a82),
  townB: linearColour(0x9c5a45),
  trees: linearColour(0x3f4a2c),
};
const FIELD_TYPES = [FIELD.lush, FIELD.pale, FIELD.golden, FIELD.lush, FIELD.pale, FIELD.crop, FIELD.golden, FIELD.ploughed];
/** Bathurst town centre in the local frame (north-east of the circuit). */
export const TOWN = { x: 2450, z: -3380, r: 1900 };

/** Far landscape: paddock patchwork on the plains and the town of Bathurst. Writes into `c`. */
function landCover(x: number, z: number, c: THREE.Color, treeTint = true): void {
  const a = 0.38, ca = Math.cos(a), sa = Math.sin(a);
  const u = x * ca + z * sa, w = -x * sa + z * ca;
  const size = 330;
  const fu = Math.floor(u / size + fbm(x / 900, z / 900, 2, 41) * 0.35), fw = Math.floor(w / (size * 0.8));
  let hsh = (fu * 73856093) ^ (fw * 19349663);
  hsh = (hsh ^ (hsh >>> 13)) >>> 0;
  const field = FIELD_TYPES[hsh % FIELD_TYPES.length];
  c.lerp(field, 0.7);
  // Windbreaks along the paddock edges and scattered stands of trees (seen from far away).
  const edgeU = Math.abs((u / size + fbm(x / 900, z / 900, 2, 41) * 0.35) % 1), edgeW = Math.abs((w / (size * 0.8)) % 1);
  const windbreak = (hsh >>> 3) % 3 === 0 && (Math.min(edgeU, 1 - edgeU) < 0.035 || Math.min(edgeW, 1 - edgeW) < 0.04);
  const stand = fbm(x / 110, z / 110, 2, 61) > 0.42;
  // Painted trees only on the far landscape; near the circuit real trees stand there.
  if (treeTint && (windbreak || stand)) c.lerp(FIELD.trees, 0.75);
  const dTown = Math.hypot(x - TOWN.x, z - TOWN.z);
  if (dTown < TOWN.r) {
    const k = Math.min(1, (TOWN.r - dTown) / 500) * 0.85;
    const roofs = fbm(x / 40, z / 40, 2, 51) > 0.15 ? FIELD.townB : FIELD.townA;
    c.lerp(roofs, k);
  }
}

function gridGeometry(
  x0: number, z0: number, w: number, h: number, cell: number,
  height: (x: number, z: number) => number,
  corridor: ((x: number, z: number) => { dist: number; wall: number; edge: number; cut: number }) | null,
  /** 0 at the edge of the detailed terrain, 1 inside: blends in the far landscape colours (no seam). */
  edgeFade?: (x: number, z: number) => number,
  aoStrength = getGraphics().bakedAo,
): THREE.BufferGeometry {
  const vx = w + 1, vz = h + 1;
  const pos = new Float32Array(vx * vz * 3);
  const col = new Float32Array(vx * vz * 3);
  const noiseK = getGraphics().terrainColourNoise;
  for (let j = 0; j < vz; j++) for (let i = 0; i < vx; i++) {
    const x = x0 + i * cell, z = z0 + j * cell;
    const k = (j * vx + i) * 3;
    pos[k] = x; pos[k + 1] = height(x, z); pos[k + 2] = z;
  }
  const idx: number[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const a = j * vx + i, b = a + 1, c = a + vx, d = c + 1;
    if ((i + j) % 2 === 0) idx.push(a, c, b, b, c, d);
    else idx.push(a, c, d, a, d, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  prepareTerrainGeometry(geo, height);
  const nrm = geo.getAttribute('normal');
  const cover = geo.getAttribute('terrainCover') as THREE.BufferAttribute;
  const tmp = new THREE.Color(), far = new THREE.Color();
  for (let v = 0; v < vx * vz; v++) {
    const x = pos[v * 3], z = pos[v * 3 + 2];
    const n1 = fbm(x / 140, z / 140, 4, 3) * noiseK;
    const n2 = fbm(x / 22, z / 22, 2, 7) * noiseK;
    const straw = fbm(x / 60, z / 60, 3, 19) * noiseK;
    tmp.copy(C.grass).lerp(n1 > 0 ? C.grassLight : C.grassDark, Math.min(1, Math.abs(n1) * 1.6));
    // Dry straw patches (tens of metres) and fine speckle break up the spring green.
    tmp.lerp(C.dry, Math.max(0, n2) * 0.35 + smooth((straw - 0.04) / 0.26) * 0.6);
    const slope = 1 - nrm.getY(v);
    if (slope > CLAY_SLOPE) tmp.lerp(C.clay, Math.min(0.9, (slope - CLAY_SLOPE) * 6));
    if (slope > ROCK_SLOPE) tmp.lerp(C.rock, Math.min(0.6, (slope - ROCK_SLOPE) * 3.5) * (0.6 + 0.4 * Math.abs(n2)));
    if (corridor) {
      const c = corridor(x, z);
      const near = c.dist - c.wall;
      const sample = { x, z, height: pos[v * 3 + 1], normalY: nrm.getY(v), trackDistance: c.dist - c.edge, lateral: c.dist, clearance: near };
      terrainSurfaceColour(sample, tmp, noiseK);
      const weights = terrainSplat(sample);
      cover.setXYZ(v, weights.green + weights.dry, sample.trackDistance, sample.lateral);
      // The Cutting: the road is cut through layered rock and clay.
      if (c.cut > 0 && near > -1 && near < CUT.blend + 4 && slope > 0.06) {
        const band = STRATA[Math.floor((pos[v * 3 + 1] + n2 * 0.9) / 1.2) % STRATA.length];
        tmp.lerp(band, c.cut * Math.min(0.92, (slope - 0.06) * 7));
      }
      const e = edgeFade ? edgeFade(x, z) : 1;
      if (e < 1) {
        far.copy(tmp);
        landCover(x, z, far, false);
        tmp.lerp(far, 1 - e);
      }
    } else {
      landCover(x, z, tmp);
    }
    col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bakeHeightFieldAo(geo, w, h, cell, aoStrength);
  geo.computeBoundingSphere();
  return geo;
}
