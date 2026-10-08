import * as THREE from 'three';
import { getGraphics, QUALITY } from '@/config/graphics';
import { linearColour } from '@/art/materials';
import { GROUND } from '@/art/palette';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, pointAt, projectToTrack, sampleArray } from '@/track/track-query';
import { createNearGrass } from '@/world/near-grass';
import type { Terrain } from '@/world/terrain';
import { createTerrainMaterial, disposeTerrainMaterial } from '@/world/terrain-detail';
import { prepareTerrainGeometry, type TerrainSurfaceSample } from '@/world/terrain-surface';

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const green = linearColour(0x708245), dry = linearColour(GROUND.grassDry), paving = linearColour(0x97958d);

/** Flat Adelaide estimate; no Mount Panorama elevation or mountain geometry is used. */
export function buildAdelaideTerrain(track: Track, quality: QualityPreset): Terrain {
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
    return below + (-0.16 - below) * smooth((c.clearance - cell * 1.5 - 2) / 15);
  };
  const surface = (x: number, z: number): TerrainSurfaceSample => {
    const c = corridor(x, z), street = c.sign > 0 && c.s > 600 && c.s < 2250 && c.clearance < 9;
    const pit = c.sign < 0 && (c.s < 160 || c.s > track.length - 160) && c.clearance < 30;
    return { x, z, height: heightFn(x, z), normalY: street || pit || x < -625 || z < -630 ? 0 : 1,
      trackDistance: c.lateral - c.edge, lateral: c.lateral, clearance: c.clearance };
  };
  const margin = 360, snap = (v: number) => Math.floor(v / cell) * cell;
  const box = { x0: snap(Math.min(Math.min(...track.px) - margin, -1650)), x1: snap(Math.max(...track.px) + margin + cell),
    z0: snap(Math.min(Math.min(...track.pz) - margin, -1120)), z1: snap(Math.max(...track.pz) + margin + cell) };
  const group = new THREE.Group(); group.name = 'adelaide-terrain';
  const material = createTerrainMaterial({ enabled: cfg.terrainDetail && tier.terrainDetail, size: tier.terrainMapSize,
    normalStrength: cfg.terrainNormalStrength, mownStrength: cfg.mownStrength });
  const geometries: THREE.BufferGeometry[] = [];
  const addGround = (name: string, x0: number, z0: number, w: number, h: number, step: number, height: (x: number, z: number) => number) => {
    const geo = groundGrid(x0, z0, w, h, step, height, (x, z) => corridor(x, z).clearance, cfg.terrainColourNoise,
      name === 'adelaide-flat-horizon' ? undefined : surface);
    const mesh = new THREE.Mesh(geo, material); mesh.name = name; mesh.receiveShadow = true;
    group.add(mesh); geometries.push(geo);
  };
  const nx = Math.round((box.x1 - box.x0) / cell), nz = Math.round((box.z1 - box.z0) / cell), chunk = 48;
  for (let x = 0; x < nx; x += chunk) for (let z = 0; z < nz; z += chunk) {
    addGround(`adelaide-parkland-${x}-${z}`, box.x0 + x * cell, box.z0 + z * cell,
      Math.min(chunk, nx - x), Math.min(chunk, nz - z), cell, heightFn);
  }
  addGround('adelaide-flat-horizon', -6000, -6000, 12, 12, 1000, () => -1.8);
  const pavingMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.94 });
  const sidewalks = pavingRibbon(track, 635, 2240, 1, 1, 6, heightFn, (x, z) => corridor(x, z).clearance);
  const apron = pavingRibbon(track, -150, 154, -1, 2, 30, () => -0.075, (x, z) => corridor(x, z).clearance);
  for (const [name, geo] of [['adelaide-street-paving', sidewalks], ['adelaide-pit-apron', apron]] as const) {
    group.add(Object.assign(new THREE.Mesh(geo, pavingMaterial), { name, receiveShadow: true })); geometries.push(geo);
  }
  const grass = createNearGrass(surface, { enabled: cfg.nearGrass && tier.nearGrass, capacity: tier.grassCapacity,
    radius: tier.grassRadius, density: cfg.grassTuftDensity, wind: cfg.grassWind });
  let disposed = false;
  return { group, box, grass, heightAt: heightFn, clearance: (x, z) => corridor(x, z).clearance, dispose() {
    if (disposed) return; disposed = true;
    grass.dispose(); geometries.forEach(geo => geo.dispose()); disposeTerrainMaterial(material); pavingMaterial.dispose(); group.clear();
  } };
}

function groundGrid(x0: number, z0: number, w: number, h: number, cell: number, height: (x: number, z: number) => number,
  clearance: (x: number, z: number) => number, noise: number, surface?: (x: number, z: number) => TerrainSurfaceSample): THREE.BufferGeometry {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [], c = new THREE.Color();
  for (let z = 0; z <= h; z++) for (let x = 0; x <= w; x++) {
    const px = x0 + x * cell, pz = z0 + z * cell;
    positions.push(px, height(px, pz), pz);
    const wave = Math.sin(px * 0.026 + Math.sin(pz * 0.013)) * Math.cos(pz * 0.021);
    c.copy(green).lerp(dry, 0.17 + Math.max(0, wave) * 0.25 * noise);
    if (px < -625 || pz < -630) c.lerp(paving, 0.65);
    c.lerp(dry, (1 - smooth(clearance(px, pz) / 5)) * 0.2);
    colours.push(c.r, c.g, c.b);
  }
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const a = z * (w + 1) + x, b = a + 1, c = a + w + 1, d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3)); geo.setIndex(indices);
  prepareTerrainGeometry(geo, height, surface); geo.computeBoundingSphere();
  return geo;
}

/** Generated paving follows the survey frame and omits pieces crossing any other track segment. */
function pavingRibbon(track: Track, from: number, to: number, sign: number, inner: number, outer: number,
  height: (x: number, z: number) => number, clearance: (x: number, z: number) => number): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], at: [number, number, number] = [0, 0, 0];
  const colour = new THREE.Color(sign > 0 ? 0xb6b0a1 : 0x555b5b);
  for (let s = from; s < to; s += 4) {
    const corners: THREE.Vector3[] = [];
    for (const [distance, offset] of [[s, inner], [s, outer], [Math.min(to, s + 4), outer], [Math.min(to, s + 4), inner]]) {
      const i = Math.floor(track.wrapS(distance) / track.spacing), side = sign > 0 ? track.left : track.right;
      pointAt(track, distance, sign * (side.wall[i] + offset), at);
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
