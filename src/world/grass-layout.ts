import { terrainSplat, type TerrainSurfaceSample } from '@/world/terrain-surface';

export type GrassGround = TerrainSurfaceSample;
export interface GrassSettings { enabled: boolean; capacity: number; radius: number; density: number; wind: number }
export interface GrassBlade { x: number; y: number; z: number; height: number; width: number; angle: number; dry: number }

/** Start the extra draw on High only; measured phone tuning can opt in later. */
export const GRASS_PRESETS = {
  low: { enabled: false, capacity: 0, radius: 24, density: 0, wind: 0 },
  medium: { enabled: false, capacity: 0, radius: 30, density: 0, wind: 0.45 },
  high: { enabled: true, capacity: 2048, radius: 42, density: 1, wind: 0.65 },
} satisfies Record<string, GrassSettings>;

const random = (x: number, z: number, salt: number) => {
  let n = Math.imul(x, 73856093) ^ Math.imul(z, 19349663) ^ Math.imul(salt, 83492791);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};

export function grassHeight(trackDistance: number, variation: number): number {
  const t = Math.min(1, Math.max(0, (trackDistance - 4) / 12));
  return (0.07 + t * 0.18) * (0.75 + variation * 0.7);
}

const CELL = 4, PER_CELL = 6;

/** The blade candidate `b` of world cell (ix, iz), or null where the ground rejects it. */
function cellBlade(ix: number, iz: number, b: number, ground: (x: number, z: number) => GrassGround): GrassBlade | null {
  const x = (ix + random(ix, iz, b * 7 + 2)) * CELL;
  const z = (iz + random(ix, iz, b * 7 + 3)) * CELL;
  const s = ground(x, z);
  if (s.trackDistance < 0.7 || s.clearance < 1.6 || s.normalY < 0.94) return null;
  const w = terrainSplat(s);
  if (w.green + w.dry < 0.72) return null;
  return { x, y: s.height - 0.02, z, height: grassHeight(s.trackDistance, random(ix, iz, b * 7 + 4)),
    width: 0.035 + random(ix, iz, b * 7 + 5) * 0.045, angle: random(ix, iz, b * 7 + 6) * Math.PI * 2, dry: w.dry / (w.green + w.dry) };
}

/**
 * Lays out the patch around (cx, cz). `known` caches each candidate's ground result by world cell, so a
 * patch that moves by a few metres samples only its new edge; the output is identical either way.
 */
function layout(cx: number, cz: number, ground: (x: number, z: number) => GrassGround, settings: GrassSettings,
  known?: Map<number, (GrassBlade | null | undefined)[]>): GrassBlade[] {
  if (!settings.enabled || settings.density <= 0 || settings.capacity <= 0) return [];
  const radius = Math.max(1, Math.min(80, settings.radius));
  const capacity = Math.max(0, Math.min(8192, Math.floor(settings.capacity)));
  const density = Math.min(1, settings.density);
  const candidates: GrassBlade[] = [];
  const iz0 = Math.floor((cz - radius) / CELL), iz1 = Math.ceil((cz + radius) / CELL);
  const ix0 = Math.floor((cx - radius) / CELL), ix1 = Math.ceil((cx + radius) / CELL);
  if (known) for (const key of known.keys()) {
    const ix = Math.round(key / 100003), iz = key - ix * 100003;
    if (ix < ix0 || ix > ix1 || iz < iz0 || iz > iz1) known.delete(key);
  }
  for (let iz = iz0; iz <= iz1; iz++) {
    for (let ix = ix0; ix <= ix1; ix++) {
      const key = ix * 100003 + iz;
      let cell = known?.get(key);
      for (let b = 0; b < PER_CELL; b++) {
        if (random(ix, iz, b * 7 + 1) > density) continue;
        const x = (ix + random(ix, iz, b * 7 + 2)) * CELL;
        const z = (iz + random(ix, iz, b * 7 + 3)) * CELL;
        if ((x - cx) ** 2 + (z - cz) ** 2 > radius * radius) continue;
        if (known && !cell) known.set(key, cell = new Array<GrassBlade | null | undefined>(PER_CELL));
        let blade = cell?.[b];
        if (blade === undefined) { blade = cellBlade(ix, iz, b, ground); if (cell) cell[b] = blade; }
        if (blade) candidates.push(blade);
      }
    }
  }
  candidates.sort((a, b) => (a.x - cx) ** 2 + (a.z - cz) ** 2 - (b.x - cx) ** 2 - (b.z - cz) ** 2);
  return candidates.slice(0, capacity);
}

/** Stable world-cell candidates prevent the entire patch sliding with the camera. */
export function grassLayout(cx: number, cz: number, ground: (x: number, z: number) => GrassGround, settings: GrassSettings): GrassBlade[] {
  return layout(cx, cz, ground, settings);
}

/**
 * Incremental grassLayout for a moving camera: keeps the ground samples of the cells it still covers.
 * `ground` must depend on the position alone. Changing `density` needs a new layout.
 */
export function createGrassLayout(ground: (x: number, z: number) => GrassGround, settings: GrassSettings): (cx: number, cz: number) => GrassBlade[] {
  const known = new Map<number, (GrassBlade | null | undefined)[]>();
  return (cx, cz) => layout(cx, cz, ground, settings, known);
}
