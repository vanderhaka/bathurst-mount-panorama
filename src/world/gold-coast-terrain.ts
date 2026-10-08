import * as THREE from 'three';
import { getGraphics, QUALITY } from '@/config/graphics';
import { linearColour } from '@/art/materials';
import { GROUND } from '@/art/palette';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, pointAt, projectToTrack, sampleArray } from '@/track/track-query';
import { GOLD_COAST_ENV, coastXAt, inSea, inWater, shoreDistance, transitDistance } from '@/world/gold-coast-geo';
import { createNearGrass } from '@/world/near-grass';
import type { Terrain } from '@/world/terrain';
import { createTerrainMaterial, disposeTerrainMaterial } from '@/world/terrain-detail';
import { prepareTerrainGeometry, type TerrainSurfaceSample } from '@/world/terrain-surface';

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const green = linearColour(0x708245), dry = linearColour(GROUND.grassDry), sand = linearColour(GROUND.sand), bed = linearColour(0x7d765f);
const BEACH = 55, SEA_FLOOR = -2, WATER_FLOOR = -1.2, SEA_Y = -0.35, WATER_Y = -0.3;

/** Flat Surfers Paradise estimate: street-circuit ground with a beach, the Pacific to the east and the Broadwater to the west. */
export function buildGoldCoastTerrain(track: Track, quality: QualityPreset): Terrain {
  const cfg = getGraphics(), tier = QUALITY[quality], cell = quality === 'low' ? 16 : quality === 'medium' ? 10 : 8;
  const tp = createTrackPoint();
  const corridor = (x: number, z: number) => {
    projectToTrack(track, x, z, -1, tp);
    const lateral = Math.abs(tp.d), side = tp.d >= 0 ? track.left : track.right;
    const wall = sampleArray(track, side.wall, tp.index, tp.t), edge = sampleArray(track, side.edge, tp.index, tp.t);
    return { lateral, wall, edge, clearance: lateral - wall, s: tp.s, sign: Math.sign(tp.d), index: tp.index, t: tp.t };
  };
  const heightFn = (x: number, z: number): number => {
    const c = corridor(x, z);
    const below = heightAt(track, c.index, c.t, c.sign * Math.min(c.lateral, c.wall)) - 0.5;
    // The cell-diagonal guard prevents a coarse triangle interpolating up through a narrow street.
    let land = below + (0 - below) * smooth((c.clearance - cell * 1.5 - 2) / 15);
    // The same guard keeps the public road and the tram bed on flat ground, level with the street dip.
    land += (below - land) * (1 - smooth((transitDistance(x, z) - cell * 1.5 - 2) / 15));
    const away = smooth((c.clearance - 4) / 4);
    if (away <= 0) return land;
    const past = x - coastXAt(z);
    if (past > 0) return land + away * SEA_FLOOR * smooth(past / 40);
    return inWater(x, z) ? land + away * WATER_FLOOR * smooth(shoreDistance(x, z) / 6) : land;
  };
  const pitLane = (c: ReturnType<typeof corridor>) => c.sign > 0 && c.lateral > 15 && c.lateral < 23 && (c.s < 294 || c.s > track.length - 298);
  const surface = (x: number, z: number): TerrainSurfaceSample => {
    const c = corridor(x, z);
    return { x, z, height: heightFn(x, z), normalY: 1, trackDistance: c.lateral - c.edge, lateral: c.lateral, clearance: c.clearance };
  };
  // Grass grows on park ground only: not on sand, sea, water, footpaths or the pit lane.
  const grassSurface = (x: number, z: number): TerrainSurfaceSample => {
    const c = corridor(x, z), s = surface(x, z), grassy = x < coastXAt(z) - BEACH && !inWater(x, z) && !pitLane(c) && c.clearance > 3.7 && transitDistance(x, z) >= 0.5;
    return grassy ? s : { ...s, normalY: 0 };
  };
  const margin = 420, snap = (v: number) => Math.floor(v / cell) * cell;
  const z0 = snap(Math.min(...track.pz) - margin), z1 = snap(Math.max(...track.pz) + margin + cell);
  let east = Math.max(...track.px) + margin;
  for (let z = z0; z <= z1; z += 20) east = Math.max(east, coastXAt(z) + 150);
  const box = { x0: snap(Math.min(...track.px) - margin), x1: snap(east + cell), z0, z1 };
  const group = new THREE.Group(); group.name = 'gold-coast-terrain';
  const material = createTerrainMaterial({ enabled: cfg.terrainDetail && tier.terrainDetail, size: tier.terrainMapSize,
    normalStrength: cfg.terrainNormalStrength, mownStrength: cfg.mownStrength });
  const geometries: THREE.BufferGeometry[] = [], seaBox = { x1: box.x1 + 3000, z0: box.z0 - 3000, z1: box.z1 + 3000 };
  const addGround = (name: string, x0: number, z0: number, w: number, h: number, step: number, height: (x: number, z: number) => number) => {
    // Horizon tiles are skipped where the sea plane already covers them.
    const covered = (cx: number, cz: number) => cx + step / 2 < seaBox.x1 && cz - step / 2 > seaBox.z0 && cz + step / 2 < seaBox.z1
      && [-1, 1].every(a => [-1, 1].every(b => inSea(cx + a * step / 2, cz + b * step / 2)));
    const geo = groundGrid(x0, z0, w, h, step, height, (x, z) => corridor(x, z).clearance, cfg.terrainColourNoise,
      name === 'gold-coast-flat-horizon' ? undefined : surface, name === 'gold-coast-flat-horizon' ? covered : undefined);
    const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.receiveShadow = true;
    group.add(mesh); geometries.push(geo);
  };
  const nx = Math.round((box.x1 - box.x0) / cell), nz = Math.round((box.z1 - box.z0) / cell), chunk = 48;
  for (let x = 0; x < nx; x += chunk) for (let z = 0; z < nz; z += chunk) {
    addGround(`gold-coast-ground-${x}-${z}`, box.x0 + x * cell, box.z0 + z * cell,
      Math.min(chunk, nx - x), Math.min(chunk, nz - z), cell, heightFn);
  }
  addGround('gold-coast-flat-horizon', -6000, -6000, 12, 12, 1000, () => -1.8);
  const seaMaterial = new THREE.MeshStandardMaterial({ color: '#1d6a86', roughness: 0.18, metalness: 0 });
  const waterMaterial = new THREE.MeshStandardMaterial({ color: '#2a6f7a', roughness: 0.22, metalness: 0 });
  const sea = seaGeometry(seaBox);
  const lakes = waterGeometry();
  const seaMesh = Object.assign(new THREE.Mesh(sea, seaMaterial), { name: 'gold-coast-sea' });
  seaMesh.position.y = SEA_Y;
  const waterMesh = Object.assign(new THREE.Mesh(lakes, waterMaterial), { name: 'gold-coast-water' });
  waterMesh.position.y = WATER_Y;
  group.add(seaMesh, waterMesh); geometries.push(sea, lakes);
  const pavingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.94 });
  const clearance = (x: number, z: number) => corridor(x, z).clearance;
  // Footpaths stop short of the public road and the tram bed.
  const footClear = (x: number, z: number) => (transitDistance(x, z) < 0.3 ? -1 : clearance(x, z));
  const foot = (side: 1 | -1) => (i: number): [number, number] => {
    const wall = (side > 0 ? track.left : track.right).wall[i];
    return [wall + 0.65, wall + 3.65];
  };
  const paving: [string, THREE.BufferGeometry][] = [
    ['gold-coast-footpath-left', pavingRibbon(track, 0, track.length, 1, foot(1), 0xb6b0a1, heightFn, footClear)],
    ['gold-coast-footpath-right', pavingRibbon(track, 0, track.length, -1, foot(-1), 0xb6b0a1, heightFn, footClear)],
    ['gold-coast-pit-lane', pavingRibbon(track, -298, 294, 1, () => [15, 23], 0x555b5b, heightFn, clearance)],
  ];
  for (const [name, geo] of paving) { group.add(Object.assign(new THREE.Mesh(geo, pavingMaterial), { name, receiveShadow: true })); geometries.push(geo); }
  const grass = createNearGrass(grassSurface, { enabled: cfg.nearGrass && tier.nearGrass, capacity: tier.grassCapacity,
    radius: tier.grassRadius, density: cfg.grassTuftDensity, wind: cfg.grassWind });
  let disposed = false;
  return { group, box, grass, heightAt: heightFn, clearance, dispose() {
    if (disposed) return; disposed = true;
    grass.dispose(); geometries.forEach(geo => geo.dispose()); disposeTerrainMaterial(material);
    pavingMaterial.dispose(); seaMaterial.dispose(); waterMaterial.dispose(); group.clear();
  } };
}

/** The Pacific: one shape whose west edge is the coastline (extended to the box edges), so it never lies under the mainland. */
function seaGeometry(box: { x1: number; z0: number; z1: number }): THREE.BufferGeometry {
  const edge: [number, number][] = [[coastXAt(box.z0), box.z0], ...GOLD_COAST_ENV.coastline.filter(p => p[1] > box.z0 && p[1] < box.z1), [coastXAt(box.z1), box.z1]];
  const ring = [...edge, [box.x1, box.z1], [box.x1, box.z0]];
  return new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z)))).rotateX(-Math.PI / 2);
}

/** All inland water rings merged into one XZ-plane geometry (shape y is -z, so the -90 degree turn restores z). */
function waterGeometry(): THREE.BufferGeometry {
  const flip = (ring: [number, number][]) => ring.map(([x, z]) => new THREE.Vector2(x, -z));
  // The extract has a single river ring, so every hole belongs to the first ring.
  const shapes = GOLD_COAST_ENV.water.map((ring, i) => Object.assign(new THREE.Shape(flip(ring)),
    { holes: i === 0 ? GOLD_COAST_ENV.waterHoles.map(h => new THREE.Path(flip(h))) : [] }));
  for (const lake of GOLD_COAST_ENV.lakes) shapes.push(new THREE.Shape(flip(lake)));
  return new THREE.ShapeGeometry(shapes).rotateX(-Math.PI / 2);
}

function groundGrid(x0: number, z0: number, w: number, h: number, cell: number, height: (x: number, z: number) => number,
  clearance: (x: number, z: number) => number, noise: number, surface?: (x: number, z: number) => TerrainSurfaceSample,
  skip?: (cx: number, cz: number) => boolean): THREE.BufferGeometry {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [], c = new THREE.Color();
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const px = x0 + x * cell, pz = z0 + z * cell, y = height(px, pz);
    positions.push(px, y, pz);
    const wave = Math.sin(px * 0.026 + Math.sin(pz * 0.013)) * Math.cos(pz * 0.021);
    c.copy(green).lerp(dry, 0.17 + Math.max(0, wave) * 0.25 * noise);
    c.lerp(dry, (1 - smooth(clearance(px, pz) / 5)) * 0.2);
    // Beach sand from 55 m before the coastline, continuing under the sea; submerged lake beds go muddy.
    c.lerp(sand, smooth((px - coastXAt(pz) + BEACH) / 10)).lerp(bed, smooth(-y / 0.8) * smooth((coastXAt(pz) - px) / 4));
    colours.push(c.r, c.g, c.b);
  }
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (skip?.(x0 + (x + 0.5) * cell, z0 + (z + 0.5) * cell)) continue;
    const a = z * (w + 1) + x, b = a + 1, c = a + w + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); geo.setIndex(indices);
  prepareTerrainGeometry(geo, height, surface); geo.computeBoundingSphere();
  return geo;
}

/** Generated paving follows the survey frame and omits pieces crossing any other track segment. */
function pavingRibbon(track: Track, from: number, to: number, sign: number, band: (i: number) => [number, number], colourHex: number,
  height: (x: number, z: number) => number, clearance: (x: number, z: number) => number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], at: [number, number, number] = [0, 0, 0];
  const colour = new THREE.Color(colourHex);
  for (let s = from; s < to; s += 4) {
    const corners: THREE.Vector3[] = [];
    for (const [distance, end] of [[s, 0], [s, 1], [Math.min(to, s + 4), 1], [Math.min(to, s + 4), 0]]) {
      pointAt(track, distance, sign * band(Math.floor(track.wrapS(distance) / track.spacing))[end], at);
      corners.push(new THREE.Vector3(at[0], height(at[0], at[2]) + 0.018, at[2]));
    }
    const centre = corners.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(0.25);
    if ([...corners, centre].some(p => clearance(p.x, p.z) < 0.65)) continue;
    for (const indices of [[0, 1, 3], [1, 2, 3]]) {
      const [a, b, c] = indices.map(i => corners[i]);
      const normalY = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z);
      if (Math.abs(normalY) < 0.1) continue;
      // Offset strips can reverse direction around a tight corner; face each surviving triangle up.
      for (const p of normalY > 0 ? [a, b, c] : [a, c, b]) {
        pos.push(p.x, p.y, p.z); col.push(colour.r, colour.g, colour.b);
      }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); geo.computeBoundingSphere();
  return geo;
}
