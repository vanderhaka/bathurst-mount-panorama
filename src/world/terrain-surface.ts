import * as THREE from 'three';
import { linearColour } from '@/art/materials';
import { GROUND } from '@/art/palette';
import type { Track } from '@/track/track-model';
import { createTrackPoint, projectToTrack, sampleArray } from '@/track/track-query';
import { fbm } from '@/world/dem';

export interface TerrainSurfaceSample {
  x: number;
  z: number;
  /** Metres above the circuit's lowest point, as used by the existing height field. */
  height: number;
  normalY: number;
  /** Metres outside the asphalt edge. Negative values are on the road. */
  trackDistance: number;
  /** Absolute lateral coordinate: stripes run parallel to the circuit. */
  lateral: number;
  /** Metres outside the barrier; grass must not grow through walls. */
  clearance: number;
}

export interface TerrainSplat { green: number; dry: number; clay: number; rock: number; gravel: number }
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
export const TERRAIN_MOWN = { width: 1.8, reach: 14, contrast: 0.055 };

/** Normalised generated cover weights, independent of mesh resolution and chunk edges. */
export function terrainSplat(s: TerrainSurfaceSample): TerrainSplat {
  const slope = clamp(1 - s.normalY);
  // Two scales (~25 m and ~120 m); fbm clusters near 0, so stretch it to use the whole range.
  const patch = clamp(0.5 + (fbm(s.x / 25, s.z / 25, 2, 33) * 0.55 + fbm(s.x / 120, s.z / 120, 3, 35) * 0.9) * 1.25);
  const rock = smooth((slope - 0.17) / 0.22) * 0.96;
  const clay = smooth((slope - 0.055) / 0.15) * (1 - rock) * 0.9;
  const gravel = (1 - smooth(Math.max(0, s.trackDistance) / 3.5)) * (1 - smooth(slope / 0.12)) * (1 - rock - clay) * 0.72;
  const vegetation = Math.max(0, 1 - rock - clay - gravel);
  const dry = Math.max(0.12, Math.min(0.88, 0.1 + smooth((s.height - 60) / 140) * 0.2 + (1 - patch) * 0.7));
  return { green: vegetation * (1 - dry), dry: vegetation * dry, clay, rock, gravel };
}

/** Subtle alternating 1.8 m mowing passes, faded before the unmown pasture. */
export function mownStripe(lateral: number, trackDistance: number, strength = 1): number {
  if (trackDistance < 0) return 1;
  return 1 + Math.cos(lateral * Math.PI / TERRAIN_MOWN.width) * TERRAIN_MOWN.contrast * (1 - smooth(trackDistance / TERRAIN_MOWN.reach)) * clamp(strength);
}

const C = {
  green: linearColour(GROUND.grass), light: linearColour(GROUND.grassLight), dark: linearColour(GROUND.grassDark),
  dry: linearColour(GROUND.grassDry), clay: linearColour(GROUND.clay), rock: linearColour(GROUND.rock), gravel: linearColour(GROUND.gravel),
};
const green = new THREE.Color();

/** Writes albedo only. Apply the existing baked AO after this call, exactly once. */
export function terrainSurfaceColour(s: TerrainSurfaceSample, out: THREE.Color, colourNoise = 1): THREE.Color {
  const w = terrainSplat(s);
  const n = fbm(s.x / 140, s.z / 140, 4, 3) * Math.max(0, colourNoise);
  green.copy(C.green).lerp(n > 0 ? C.light : C.dark, clamp(Math.abs(n) * 1.6));
  out.setRGB(
    green.r * w.green + C.dry.r * w.dry + C.clay.r * w.clay + C.rock.r * w.rock + C.gravel.r * w.gravel,
    green.g * w.green + C.dry.g * w.dry + C.clay.g * w.clay + C.rock.g * w.rock + C.gravel.g * w.gravel,
    green.b * w.green + C.dry.b * w.dry + C.clay.b * w.clay + C.rock.b * w.rock + C.gravel.b * w.gravel,
  );
  return out; // Mowing is evaluated per fragment, beyond the 6 m terrain vertex spacing.
}

/** Replaces albedo by a channel ratio, retaining previously baked terrain/contact AO. */
export function applyTerrainAlbedoRatio(baked: THREE.Color, baseAlbedo: THREE.Color, refinedAlbedo: THREE.Color, out: THREE.Color): THREE.Color {
  return out.setRGB(
    baked.r * refinedAlbedo.r / Math.max(0.0001, baseAlbedo.r),
    baked.g * refinedAlbedo.g / Math.max(0.0001, baseAlbedo.g),
    baked.b * refinedAlbedo.b / Math.max(0.0001, baseAlbedo.b),
  );
}

/** Samples the unchanged height function for smooth normals, including across chunk boundaries. */
export function terrainNormal(x: number, z: number, height: (x: number, z: number) => number, out: THREE.Vector3): THREE.Vector3 {
  const d = 0.75;
  const dx = (height(x + d, z) - height(x - d, z)) / (2 * d);
  const dz = (height(x, z + d) - height(x, z - d)) / (2 * d);
  return out.set(-dx, 1, -dz).normalize();
}

/** Adds world-scaled UVs and smooth normals; positions, indices and AO colours remain untouched. */
export function prepareTerrainGeometry(geometry: THREE.BufferGeometry, height: (x: number, z: number) => number,
  surface?: (x: number, z: number) => TerrainSurfaceSample): void {
  const pos = geometry.getAttribute('position');
  const normal = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3);
  const uv = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2);
  const cover = new THREE.Float32BufferAttribute(new Float32Array(pos.count * 3), 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    terrainNormal(x, z, height, n);
    normal.setXYZ(i, n.x, n.y, n.z);
    uv.setXY(i, x / 8, z / 8);
    if (surface) {
      const s = surface(x, z), weights = terrainSplat(s);
      cover.setXYZ(i, weights.green + weights.dry, s.trackDistance, s.lateral);
    }
  }
  geometry.setAttribute('normal', normal);
  geometry.setAttribute('uv', uv);
  geometry.setAttribute('terrainCover', cover);
}

/**
 * Builds a reusable, synchronous sampler for the colour pass and the local grass patch. Each sample
 * depends on the position alone (no search hint), so the grass patch can cache it by world cell.
 */
export function createTerrainSurfaceSampler(track: Track, height: (x: number, z: number) => number): (x: number, z: number) => TerrainSurfaceSample {
  const tp = createTrackPoint(), n = new THREE.Vector3();
  return (x, z) => {
    projectToTrack(track, x, z, -1, tp);
    const side = tp.d >= 0 ? track.left : track.right;
    const lateral = Math.abs(tp.d);
    const trackDistance = lateral - sampleArray(track, side.edge, tp.index, tp.t);
    const clearance = lateral - sampleArray(track, side.wall, tp.index, tp.t);
    terrainNormal(x, z, height, n);
    return { x, z, height: height(x, z), normalY: n.y, trackDistance, lateral, clearance };
  };
}
