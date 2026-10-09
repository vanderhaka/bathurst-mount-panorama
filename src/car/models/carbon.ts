// Procedural carbon-fibre weave (2x2 twill) for the splitter and wing: colour,
// roughness and normal tiles painted once on a canvas and shared by every car,
// plus box-projected UVs for the lofted/extruded parts, which have none.
import * as THREE from 'three';

export interface CarbonMaps { map: THREE.Texture; roughnessMap: THREE.Texture; normalMap: THREE.Texture }

const TILE = 256;
/** Tows per tile edge; the tile covers TOWS * TOW_M metres of surface. */
const TOWS = 8;
const TOW_M = 0.003;
/** UV scale (tiles per metre) for the box projection. */
export const CARBON_UV_SCALE = 1 / (TOWS * TOW_M);

let cached: CarbonMaps | null = null;

/** Weave height (0..1) and whether the top tow runs vertically, at tile pixel (x, y). */
function weave(x: number, y: number): { h: number; vertical: boolean } {
  const cell = TILE / TOWS;
  const i = Math.floor(x / cell), j = Math.floor(y / cell);
  const vertical = (i + j) % 4 < 2; // 2x2 twill: the diagonal stagger
  const across = ((vertical ? x : y) % cell) / cell;
  const along = ((vertical ? y : x) % cell) / cell;
  // Rounded tow (cosine across its width) with fine fibre striations along it.
  const bump = Math.sin(across * Math.PI);
  const fibres = 0.06 * Math.sin(across * Math.PI * 14) + 0.03 * Math.sin(along * Math.PI * 2);
  return { h: 0.25 + 0.7 * bump + fibres, vertical };
}

function paint(fill: (x: number, y: number, px: Uint8ClampedArray, o: number) => void, colourSpace: THREE.ColorSpace): THREE.Texture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(TILE, TILE) as ImageData | undefined;
  if (!img?.data) return null; // stubbed canvas (tests)
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const o = (y * TILE + x) * 4;
    fill(x, y, img.data, o);
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = colourSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  return t;
}

/** The shared weave maps (null without a DOM, e.g. in tests). */
export function carbonMaps(): CarbonMaps | null {
  if (cached) return cached;
  const map = paint((x, y, px, o) => {
    const { h, vertical } = weave(x, y);
    // Vertical tows catch a little more light than horizontal ones (the anisotropic sheen).
    const v = Math.round(255 * (0.5 + 0.45 * h) * (vertical ? 1 : 0.82));
    px[o] = v; px[o + 1] = v; px[o + 2] = v;
  }, THREE.SRGBColorSpace);
  const roughnessMap = paint((x, y, px, o) => {
    const v = Math.round(255 * (1.05 - 0.35 * weave(x, y).h));
    px[o] = v; px[o + 1] = v; px[o + 2] = v;
  }, THREE.NoColorSpace);
  const normalMap = paint((x, y, px, o) => {
    const dx = (weave((x + 1) % TILE, y).h - weave((x + TILE - 1) % TILE, y).h) * 1.6;
    const dy = (weave(x, (y + 1) % TILE).h - weave(x, (y + TILE - 1) % TILE).h) * 1.6;
    const n = new THREE.Vector3(-dx, dy, 1).normalize();
    px[o] = Math.round(127.5 + 127.5 * n.x); px[o + 1] = Math.round(127.5 + 127.5 * n.y); px[o + 2] = Math.round(127.5 + 127.5 * n.z);
  }, THREE.NoColorSpace);
  if (!map || !roughnessMap || !normalMap) return null;
  cached = { map, roughnessMap, normalMap };
  return cached;
}

/** Writes box-projected UVs (per face, by the dominant normal axis) onto a non-indexed geometry. */
export function boxUvs(g: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(p.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i + 2 < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    n.subVectors(b, a).cross(c.sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = p.getX(i + k), y = p.getY(i + k), z = p.getZ(i + k);
      const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
      uv[(i + k) * 2] = u * scale;
      uv[(i + k) * 2 + 1] = v * scale;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
