// Brake-disc maps for the lathed disc (u around the axle, v along the profile):
// a brushed steel face with two staggered rings of drilled holes, a faint blue
// heat band at the rim and a darker bell. The emissive map keeps the holes and
// the bell dark, so only the friction face glows when the brakes are hot.
import * as THREE from 'three';

export interface DiscMaps { map: THREE.Texture; emissiveMap: THREE.Texture }

const W = 512, H = 128;
/** Profile v ranges of discGeometry (see wheel-geometry.ts): back face, edge, face, bell. */
const BACK: [number, number] = [0, 0.2];
const FACE: [number, number] = [0.4, 0.6];
const INNER = 0.105;
const HOLE_R = 0.0035;
const HOLES = 18;

const cache = new Map<number, DiscMaps>();

/** 0..1 drilled-hole mask at polar (r, theta) on a face spanning INNER..outer. */
function holes(r: number, theta: number, outer: number): number {
  let mask = 1;
  for (const [k, offset] of [[0.36, 0], [0.68, 0.5]] as const) {
    const rh = INNER + k * (outer - INNER);
    const step = (Math.PI * 2) / HOLES;
    const t = ((theta / step - offset) % 1 + 1) % 1;
    const dTheta = Math.min(t, 1 - t) * step;
    const d = Math.hypot(r - rh, dTheta * r);
    mask = Math.min(mask, THREE.MathUtils.smoothstep(d, HOLE_R, HOLE_R + 0.0012));
  }
  return mask;
}

function paint(outer: number, emissive: boolean): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(W, H) as ImageData | undefined;
  if (!img?.data) return null; // stubbed canvas (tests)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = 1 - (y + 0.5) / H;
    const theta = u * Math.PI * 2;
    let rgb: [number, number, number];
    if (v >= FACE[0] && v <= FACE[1]) {
      const r = outer - ((v - FACE[0]) / (FACE[1] - FACE[0])) * (outer - INNER);
      const brushed = 0.9 + 0.1 * Math.sin(r * 2600 + Math.sin(theta * 3) * 0.5);
      const heat = THREE.MathUtils.smoothstep(r, outer - 0.03, outer - 0.006);
      const k = holes(r, theta, outer);
      rgb = emissive ? [k, k * 0.8, k * 0.6] : [brushed * (0.72 + 0.1 * heat) * k, brushed * (0.74 + 0.08 * heat) * k, brushed * (0.78 + 0.16 * heat) * k];
    } else if (v < BACK[1]) {
      const r = INNER + ((v - BACK[0]) / (BACK[1] - BACK[0])) * (outer - INNER);
      const k = holes(r, theta, outer);
      rgb = emissive ? [k * 0.7, k * 0.5, k * 0.4] : [0.55 * k, 0.56 * k, 0.6 * k];
    } else if (v < FACE[0]) {
      rgb = emissive ? [0.6, 0.45, 0.3] : [0.5, 0.5, 0.52]; // rim edge
    } else {
      rgb = emissive ? [0.05, 0.03, 0.02] : [0.3, 0.3, 0.32]; // bell
    }
    const o = (y * W + x) * 4;
    img.data[o] = Math.round(255 * Math.min(1, rgb[0]));
    img.data[o + 1] = Math.round(255 * Math.min(1, rgb[1]));
    img.data[o + 2] = Math.round(255 * Math.min(1, rgb[2]));
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

/** Shared maps for a disc of outer radius `outer` (null without a DOM). */
export function discMaps(outer: number): DiscMaps | null {
  const key = Math.round(outer * 1000);
  const hit = cache.get(key);
  if (hit) return hit;
  const map = paint(outer, false);
  const emissiveMap = paint(outer, true);
  if (!map || !emissiveMap) return null;
  const maps = { map, emissiveMap };
  cache.set(key, maps);
  return maps;
}
