import demJson from '@/track/data/terrain-dem.json';

interface DemGrid {
  centerX: number;
  centerZ: number;
  size: number;
  n: number;
  heights: number[];
}

const near = demJson.near as DemGrid;
const far = demJson.far as DemGrid;

function bilinear(g: DemGrid, x: number, z: number): number | null {
  const fx = ((x - (g.centerX - g.size / 2)) / g.size) * (g.n - 1);
  const fz = ((z - (g.centerZ - g.size / 2)) / g.size) * (g.n - 1);
  if (fx < 0 || fz < 0 || fx > g.n - 1 || fz > g.n - 1) return null;
  const i = Math.min(g.n - 2, Math.floor(fx)), j = Math.min(g.n - 2, Math.floor(fz));
  const tx = fx - i, tz = fz - j;
  const h = g.heights;
  const a = h[j * g.n + i], b = h[j * g.n + i + 1], c = h[(j + 1) * g.n + i], d = h[(j + 1) * g.n + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

/** Distance (m) from the edge of the near DEM inward (negative outside). */
function nearInset(x: number, z: number): number {
  const half = near.size / 2;
  return Math.min(half - Math.abs(x - near.centerX), half - Math.abs(z - near.centerZ));
}

/**
 * Real terrain height (SRTM, metres above the circuit's lowest point) at world x/z.
 * Uses the 60 m near grid and fades into the 500 m far grid at its border.
 */
export function demHeight(x: number, z: number): number {
  const f = bilinear(far, x, z) ?? 0;
  const inset = nearInset(x, z);
  if (inset <= 0) return f;
  const nh = bilinear(near, x, z) ?? f;
  const t = Math.min(1, inset / 400);
  return f + (nh - f) * t;
}

export const DEM_EXTENT = { near: { cx: near.centerX, cz: near.centerZ, size: near.size }, far: { cx: far.centerX, cz: far.centerZ, size: far.size } };

/** Small deterministic value noise (for terrain facets and colour variation). */
export function valueNoise(x: number, z: number, seed = 0): number {
  const xi = Math.floor(x), zi = Math.floor(z);
  const tx = x - xi, tz = z - zi;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number) => {
    let n = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
  return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

/** Fractal noise in [-1, 1]. */
export function fbm(x: number, z: number, octaves = 4, seed = 0): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += (valueNoise(x * freq, z * freq, seed + o) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}
