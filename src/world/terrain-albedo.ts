import * as THREE from 'three';

const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const wrap = (n: number, period: number) => ((n % period) + period) % period;
const smooth = (n: number) => n * n * (3 - 2 * n);

/** Whole-period value noise, so the albedo tile wraps without a seam. */
function periodic(u: number, v: number, cellsX: number, cellsY: number, seed: number): number {
  const x = wrap(u, 1) * cellsX, y = wrap(v, 1) * cellsY;
  const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
  const h = (a: number, b: number) => hash(wrap(a, cellsX), wrap(b, cellsY), seed);
  const a = h(ix, iy) * (1 - tx) + h(ix + 1, iy) * tx;
  const b = h(ix, iy + 1) * (1 - tx) + h(ix + 1, iy + 1) * tx;
  return a * (1 - ty) + b * ty;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * RGB is grass; alpha is dirt. Neutral-grey (sRGB ~0.73, linear ~0.5) grass and dirt detail: clumps, blade streaks, dark soil specks and a slight
 * green/straw hue drift. The shader multiplies by 2.0 per layer so the average brightness is preserved.
 */
export function createTerrainAlbedoData(size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 16 || size > 1024 || (size & (size - 1)) !== 0) throw new Error('Terrain albedo size must be a power of two from 16 to 1024');
  const out = new Uint8Array(size * size * 4);
  const cells = (n: number) => Math.min(n, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size, i = (y * size + x) * 4;
    const clump = periodic(u, v, cells(6), cells(6), 11) * 0.5 + periodic(u, v, cells(16), cells(16), 13) * 0.5;
    const blade = periodic(u, v, cells(96), cells(24), 17) * 0.55 + periodic(u, v, cells(48), cells(128), 19) * 0.45;
    const fine = periodic(u, v, cells(256), cells(256), 23);
    let l = 0.5 + (clump - 0.5) * 1.5 + (blade - 0.5) * 0.77 + (fine - 0.5) * 0.35;
    const speck = hash(x, y, 29);
    if (speck > 0.985) l -= 0.3 + hash(x, y, 31) * 0.25; // soil / shadow specks
    else if (speck < 0.012) l += 0.18; // pale dry stalk
    const hue = periodic(u, v, cells(10), cells(10), 37) - 0.5; // + straw, - green
    const k = 0.73 * (0.3 + clamp01(l) * 1.4);
    out[i] = Math.round(clamp01(k * (1 + hue * 0.22)) * 255);
    out[i + 1] = Math.round(clamp01(k * (1 - Math.abs(hue) * 0.05)) * 255);
    out[i + 2] = Math.round(clamp01(k * (1 - hue * 0.3)) * 255);
    // Alpha carries the dirt/gravel variant: fine stones, sand grain, sparse dead grass.
    const grit = periodic(u, v, cells(128), cells(128), 41) * 0.5 + periodic(u, v, cells(512), cells(512), 43) * 0.5;
    const stone = hash(x, y, 47);
    let d = 0.5 + (periodic(u, v, cells(10), cells(10), 53) - 0.5) * 0.9 + (grit - 0.5) * 0.9;
    if (stone > 0.97) d += 0.3; else if (stone < 0.02) d -= 0.3;
    out[i + 3] = Math.round(clamp01(0.73 * (0.3 + clamp01(d) * 1.4)) * 255);
  }
  return out;
}

export function createTerrainAlbedoTexture(size: number): THREE.DataTexture {
  const map = new THREE.DataTexture(createTerrainAlbedoData(size), size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 8;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

/** World-space low-frequency tint (all tiers): 3 m clumps, 15 m patches, 90 m zones, green against straw. */
export const TERRAIN_COLOUR_GLSL = `
float tHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float tNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tHash(i), tHash(i + vec2(1.0, 0.0)), f.x), mix(tHash(i + vec2(0.0, 1.0)), tHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
vec3 terrainTint(vec2 w, float strength) {
  float zone = tNoise(w / 90.0 + 7.3), blotch = tNoise(w / 15.0 + 1.7), clump = tNoise(w / 3.0 + 4.1);
  float n = (zone - 0.5) * 1.1 + (blotch - 0.5) * 1.1 + (clump - 0.5) * 0.35;
  vec3 green = vec3(0.70, 1.0, 0.62), straw = vec3(1.24, 1.0, 0.76);
  return mix(vec3(1.0), mix(green, straw, clamp(n * 1.9 + 0.5, 0.0, 1.0)), strength);
}`;
