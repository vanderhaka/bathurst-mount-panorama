import * as THREE from 'three';

// Procedural canvas textures. All tile seamlessly: noise is built from
// periodic value noise on a lattice that wraps at the texture size.

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function periodicNoise(size: number, cells: number, seed: number): Float32Array {
  const lattice = new Float32Array(cells * cells);
  let s = seed;
  for (let i = 0; i < lattice.length; i++) {
    s = (s * 16807) % 2147483647;
    lattice[i] = s / 2147483647;
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = (x / size) * cells, fy = (y / size) * cells;
    const xi = Math.floor(fx), yi = Math.floor(fy);
    const tx = fx - xi, ty = fy - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const L = (a: number, b: number) => lattice[((b % cells) * cells) + (a % cells)];
    const v = (L(xi, yi) * (1 - sx) + L(xi + 1, yi) * sx) * (1 - sy) + (L(xi, yi + 1) * (1 - sx) + L(xi + 1, yi + 1) * sx) * sy;
    out[y * size + x] = v;
  }
  return out;
}

/** Asphalt grain: mid-grey with fine aggregate and soft blotches. Tiles in both directions. */
export function asphaltTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  const img = ctx.createImageData(size, size);
  const fine = periodicNoise(size, 256, 3);
  const mid = periodicNoise(size, 64, 7);
  const big = periodicNoise(size, 8, 13);
  let s = 99;
  for (let i = 0; i < size * size; i++) {
    s = (s * 16807) % 2147483647;
    const speck = s / 2147483647;
    let v = 0.62 + (fine[i] - 0.5) * 0.2 + (mid[i] - 0.5) * 0.08 + (big[i] - 0.5) * 0.05;
    if (speck > 0.97) v += 0.16;
    else if (speck < 0.03) v -= 0.12;
    const g = Math.max(0, Math.min(255, v * 255));
    img.data[i * 4] = g;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = g * 1.01;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

/** Chain-link fence: diamond wire pattern in the alpha channel. One repeat = 0.5 m. */
export function chainLinkTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(205,210,214,1)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Diagonals every quarter tile; they wrap seamlessly.
  for (let off = -size; off <= size; off += size / 4) {
    ctx.moveTo(off, 0); ctx.lineTo(off + size, size);
    ctx.moveTo(off + size, 0); ctx.lineTo(off, size);
  }
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/** Concrete barrier panels: smooth pale concrete, joints every 3 m (texture spans 6 m), light grime at the base. */
export function concreteTexture(renderer: THREE.WebGLRenderer): THREE.CanvasTexture {
  const w = 1024, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const fine = periodicNoise(w, 256, 21);
  const broad = periodicNoise(w, 16, 22);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const n = fine[(y % w) * w + x] - 0.5, b = broad[(y % w) * w + x] - 0.5;
    let v = 0.86 + n * 0.035 + b * 0.05;
    // Grime and water stains near the base (texture bottom = wall base).
    v -= Math.max(0, (y - h * 0.72) / (h * 0.28)) ** 1.6 * 0.16;
    // Panel joints (dark groove with a light edge).
    const jx = x % (w / 2);
    if (jx < 3) v -= 0.3;
    else if (jx < 5) v += 0.04;
    // Top chamfer highlight.
    if (y < 4) v += 0.05;
    const g = Math.max(0, Math.min(255, v * 255));
    img.data[i * 4] = g; img.data[i * 4 + 1] = g * 0.99; img.data[i * 4 + 2] = g * 0.955; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
