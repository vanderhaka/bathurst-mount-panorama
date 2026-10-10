import { clamp01, sealTextureEdges, smoothStep, surfaceHash, surfaceNoise } from '@/world/surface-noise';

export interface AsphaltMaps {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  roughness: Uint8Array;
  meanLinear: number;
}

/** Four metre aggregate tile. Height is millimetre-scale; dry roughness is 0.72–0.86. */
export function generateAsphaltMaps(size: number): AsphaltMaps {
  const albedo = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(albedo.length), roughness = new Uint8Array(albedo.length);
  const height = new Float32Array(size * size);
  const cells = Math.max(32, Math.min(512, size / 2));
  let linearSum = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1), i = y * size + x, p = i * 4;
    const fine = surfaceNoise(u, v, cells, 3), mid = surfaceNoise(u, v, 32, 7);
    const broad = surfaceNoise(u, v, 8, 13);
    height[i] = (fine - 0.5) * 1.4 + (mid - 0.5) * 0.1;
    const srgb = clamp01(0.60 + (fine - 0.5) * 0.19 + (mid - 0.5) * 0.08 + (broad - 0.5) * 0.025);
    const shade = Math.round(srgb * 255);
    albedo.set([shade, shade, Math.min(255, Math.round(shade * 1.01)), 255], p);
    linearSum += ((shade / 255 + 0.055) / 1.055) ** 2.4;
    const r = Math.round((0.79 + (fine * 0.7 + mid * 0.3 - 0.5) * 0.13 + (broad - 0.5) * 0.05) * 255);
    roughness.set([r, r, r, 255], p);
  }
  const h = (x: number, y: number) => height[((y + size - 1) % (size - 1)) * size + (x + size - 1) % (size - 1)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * 0.27;
    const dy = (h(x, y + 1) - h(x, y - 1)) * 0.27;
    const length = Math.hypot(dx, dy, 1);
    normal.set([Math.round((1 - dx / length) * 127.5), Math.round((1 - dy / length) * 127.5), Math.round((1 + 1 / length) * 127.5), 255], (y * size + x) * 4);
  }
  for (const data of [albedo, normal, roughness]) sealTextureEdges(data, size);
  return { size, albedo, normal, roughness, meanLinear: linearSum / (size * size) };
}

type Segment = [number, number, number, number];
const cracks: Segment[] = [];
for (let path = 0; path < 7; path++) {
  let x = path < 2 ? path * 0.045 : surfaceHash(path, 0, 24);
  let y = surfaceHash(path, 1, 24);
  for (let k = 0; k < 5; k++) {
    const nx = x + (surfaceHash(path, k, 31) - 0.5) * 0.13;
    const ny = y + 0.018 + surfaceHash(path, k, 35) * 0.045;
    cracks.push([x, y, nx, ny]);
    x = nx; y = ny;
  }
}

function periodicDistanceSquared(u: number, v: number, s: Segment): number {
  const [ax, ay, bx, by] = s;
  const x = u + Math.round((ax + bx) * 0.5 - u), y = v + Math.round((ay + by) * 0.5 - v);
  const dx = bx - ax, dy = by - ay;
  const t = clamp01(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy));
  return (x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2;
}

/** 64 metre macro tile: R = repairs, G = crack sealing, B = broad (~30 m) wear, A = longitudinal wheel-track streaks. */
export function generateWeatherMap(size: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const halfTexel = 0.5 / (size - 1), sealWidth = 0.0013; // about 8 cm at the core
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1);
    const patch = smoothStep(0.68, 0.76, surfaceNoise(u, v, 4, 71));
    let distance = Infinity;
    for (const segment of cracks) distance = Math.min(distance, periodicDistanceSquared(u, v, segment));
    const seal = 1 - smoothStep(sealWidth * 0.5, sealWidth + halfTexel, Math.sqrt(distance));
    // u runs across the road (16 m per 0.25 repeat), v along it: streaks are many across, few along.
    const broad = surfaceNoise(u, v, 2, 83) * 0.65 + surfaceNoise(u, v, 5, 87) * 0.35;
    const streak = surfaceNoise(u, v, 48, 91) * (0.4 + 0.6 * surfaceNoise(u, v, 3, 97));
    data.set([Math.round(patch * 255), Math.round(seal * 255), Math.round(broad * 255), Math.round(clamp01(streak) * 255)], (y * size + x) * 4);
  }
  sealTextureEdges(data, size);
  return data;
}
