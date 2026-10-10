// Procedural clearcoat orange-peel and metallic-flake maps for MeshPhysicalMaterial paint.
// Shared across cars; null without a DOM (tests).
import * as THREE from 'three';

export interface PaintMaps {
  /** Fine flake normals under the clearcoat (tiling). */
  normalMap: THREE.Texture;
  /** Base roughness variation from flake scatter. */
  roughnessMap: THREE.Texture;
  /** Larger-scale orange-peel for the clearcoat lobe. */
  clearcoatNormalMap: THREE.Texture;
}

const FLAKE = 256;
const PEEL = 128;
let cached: PaintMaps | null = null;

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function paint(
  size: number,
  fill: (x: number, y: number, px: Uint8ClampedArray, o: number) => void,
  colourSpace: THREE.ColorSpace,
  wrap = true,
): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size) as ImageData | undefined;
  if (!img?.data) return null;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = (y * size + x) * 4;
    fill(x, y, img.data, o);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = colourSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

/** Shared paint detail maps (flake + orange-peel). */
export function paintMaps(): PaintMaps | null {
  if (cached) return cached;
  const normalMap = paint(FLAKE, (x, y, px, o) => {
    // Sparse metallic flakes: occasional sharp normal kicks.
    const flake = hash(x, y) > 0.92 ? (hash(x + 3, y + 7) - 0.5) * 0.55 : (hash(x * 0.2, y * 0.2) - 0.5) * 0.04;
    const flakeY = hash(x + 11, y + 5) > 0.92 ? (hash(x + 9, y + 2) - 0.5) * 0.55 : (hash(x * 0.2 + 1, y * 0.2) - 0.5) * 0.04;
    const n = new THREE.Vector3(-flake, flakeY, 1).normalize();
    px[o] = Math.round(127.5 + 127.5 * n.x);
    px[o + 1] = Math.round(127.5 + 127.5 * n.y);
    px[o + 2] = Math.round(127.5 + 127.5 * n.z);
  }, THREE.NoColorSpace);
  const roughnessMap = paint(FLAKE, (x, y, px, o) => {
    const flake = hash(x, y) > 0.9 ? 0.35 : 0.55 + 0.2 * hash(x * 0.15, y * 0.15);
    const v = Math.round(255 * flake);
    px[o] = v; px[o + 1] = v; px[o + 2] = v;
  }, THREE.NoColorSpace);
  const clearcoatNormalMap = paint(PEEL, (x, y, px, o) => {
    // Low-frequency orange-peel (millimetre-scale when UV-scaled).
    const u = x / PEEL, v = y / PEEL;
    const dx = Math.sin(u * Math.PI * 7.3) * 0.12 + Math.sin(u * Math.PI * 18.1 + v * 9) * 0.06;
    const dy = Math.sin(v * Math.PI * 6.8) * 0.12 + Math.sin(v * Math.PI * 16.4 + u * 8) * 0.06;
    const n = new THREE.Vector3(-dx, dy, 1).normalize();
    px[o] = Math.round(127.5 + 127.5 * n.x);
    px[o + 1] = Math.round(127.5 + 127.5 * n.y);
    px[o + 2] = Math.round(127.5 + 127.5 * n.z);
  }, THREE.NoColorSpace);
  if (!normalMap || !roughnessMap || !clearcoatNormalMap) return null;
  // Flakes tile densely; peel is coarser on the body.
  normalMap.repeat.set(14, 14);
  roughnessMap.repeat.set(14, 14);
  clearcoatNormalMap.repeat.set(3.5, 3.5);
  cached = { normalMap, roughnessMap, clearcoatNormalMap };
  return cached;
}
