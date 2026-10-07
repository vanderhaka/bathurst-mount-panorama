/** Integer hash, stable across builds. Values in [0, 1]. */
export function surfaceHash(x: number, y: number, seed: number): number {
  let n = Math.imul(x + seed * 17, 374761393) ^ Math.imul(y + seed, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export function smoothStep(from: number, to: number, v: number): number {
  const t = clamp01((v - from) / (to - from));
  return t * t * (3 - 2 * t);
}

/** Value noise with an integer number of cells in each complete UV period. */
export function surfaceNoise(u: number, v: number, cells: number, seed: number): number {
  const x = ((u % 1 + 1) % 1) * cells, y = ((v % 1 + 1) % 1) * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  const tx = smoothStep(0, 1, x - ix), ty = smoothStep(0, 1, y - iy);
  const at = (a: number, b: number) => surfaceHash(a % cells, b % cells, seed);
  const a = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
  const b = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
  return a * (1 - ty) + b * ty;
}

/** Copy opposite edge texels too, so bilinear/mip filtering remains wrap-safe. */
export function sealTextureEdges(data: Uint8Array, size: number): void {
  for (let i = 0; i < size; i++) {
    data.copyWithin((i * size + size - 1) * 4, i * size * 4, (i * size + 1) * 4);
    data.copyWithin(((size - 1) * size + i) * 4, i * 4, (i + 1) * 4);
  }
}
