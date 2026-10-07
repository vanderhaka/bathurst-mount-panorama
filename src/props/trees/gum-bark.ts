export interface BarkTile { albedo: Uint8Array; normal: Uint8Array; roughness: Uint8Array }

/** Whole-period fibres/mottles, with a finer, stronger relief on grey box bark. */
export function generateBarkTile(size: number, kind: 'smooth' | 'box'): BarkTile {
  const box = kind === 'box', height = new Float32Array(size * size);
  const albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(albedo.length), roughness = new Uint8Array(albedo.length);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1), i = y * size + x, k = i * 4;
    const fibre = Math.sin(u * tau * 21 + Math.sin(v * tau * 2) * 0.4);
    const grain = Math.sin(u * tau * 53 + v * tau * 17) * Math.sin(v * tau * 23);
    const mottle = Math.sin(u * tau * 3 + Math.sin(v * tau * 2)) * Math.sin(v * tau * 3 + u * tau);
    height[i] = box ? fibre * 0.008 + grain * 0.001 : mottle * 0.0007;
    const light = box ? 0.89 + fibre * 0.07 + grain * 0.015 : 0.96 + mottle * 0.035;
    const r = box ? 0.95 + grain * 0.03 : 0.72 + mottle * 0.04;
    for (let c = 0; c < 3; c++) { albedo[k + c] = Math.round(light * 255); roughness[k + c] = Math.round(r * 255); }
    albedo[k + 3] = roughness[k + 3] = 255;
  }
  const period = size - 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const sample = (xx: number, yy: number) => height[((yy + period) % period) * size + (xx + period) % period];
    const dx = (sample(x + 1, y) - sample(x - 1, y)) * period * 0.5;
    const dy = (sample(x, y + 1) - sample(x, y - 1)) * period * 0.5;
    const len = Math.hypot(dx, dy, 1), i = (y * size + x) * 4;
    normal[i] = Math.round((0.5 - dx / len * 0.5) * 255);
    normal[i + 1] = Math.round((0.5 - dy / len * 0.5) * 255);
    normal[i + 2] = Math.round((0.5 + 0.5 / len) * 255); normal[i + 3] = 255;
  }
  for (const data of [albedo, normal, roughness]) {
    for (let y = 0; y < size; y++) data.copyWithin((y * size + size - 1) * 4, y * size * 4, y * size * 4 + 4);
    data.copyWithin((size - 1) * size * 4, 0, size * 4);
  }
  return { albedo, normal, roughness };
}
