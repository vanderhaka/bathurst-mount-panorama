// Sidewall / tread roughness and normal detail for racing slicks (procedural).
import * as THREE from 'three';

export interface TyreMaps {
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
}

const W = 1024;
const H = 256;
let cached: TyreMaps | null = null;

function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function paint(fill: (x: number, y: number, px: Uint8ClampedArray, o: number) => void, colourSpace: THREE.ColorSpace): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(W, H) as ImageData | undefined;
  if (!img?.data) return null;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4;
    fill(x, y, img.data, o);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = colourSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

/**
 * Lathe UVs: v ~0.4..0.6 is the tread, sidewalls toward 0 and 1.
 * Tread is rougher; sidewalls a little smoother with circumferential rings.
 */
export function tyreMaps(): TyreMaps | null {
  if (cached) return cached;
  const roughnessMap = paint((x, y, px, o) => {
    const v = 1 - y / (H - 1);
    const tread = v > 0.38 && v < 0.62;
    const sidewall = v > 0.78 || v < 0.22;
    let r = tread ? 0.92 : sidewall ? 0.78 : 0.88;
    r += (hash(x, y) - 0.5) * (tread ? 0.06 : 0.04);
    // Faint circumferential wear band on the outer sidewall.
    if (sidewall && Math.abs(v - 0.88) < 0.03) r -= 0.08;
    const c = Math.round(255 * Math.max(0.2, Math.min(1, r)));
    px[o] = c; px[o + 1] = c; px[o + 2] = c;
  }, THREE.NoColorSpace);
  const normalMap = paint((x, y, px, o) => {
    const v = 1 - y / (H - 1);
    const tread = v > 0.38 && v < 0.62;
    // Slicks: subtle circumferential micro-grooves on the tread, embossed sidewall rings.
    let dx = 0, dy = 0;
    if (tread) {
      dx = Math.sin((x / W) * Math.PI * 2 * 48) * 0.08;
      dy = (hash(x, y) - 0.5) * 0.05;
    } else {
      dy = Math.sin(v * Math.PI * 40) * 0.1;
      dx = (hash(x * 0.5, y) - 0.5) * 0.04;
    }
    const n = new THREE.Vector3(-dx, dy, 1).normalize();
    px[o] = Math.round(127.5 + 127.5 * n.x);
    px[o + 1] = Math.round(127.5 + 127.5 * n.y);
    px[o + 2] = Math.round(127.5 + 127.5 * n.z);
  }, THREE.NoColorSpace);
  if (!roughnessMap || !normalMap) return null;
  cached = { roughnessMap, normalMap };
  return cached;
}
