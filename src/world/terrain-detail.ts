import * as THREE from 'three';
import { TERRAIN_MOWN } from '@/world/terrain-surface';

const hash = (x: number, y: number, seed: number) => {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const wrap = (n: number, period: number) => ((n % period) + period) % period;
const smooth = (n: number) => n * n * (3 - 2 * n);

function periodic(u: number, v: number, cells: number, seed: number): number {
  const x = wrap(u, 1) * cells, y = wrap(v, 1) * cells;
  const ix = Math.floor(x), iy = Math.floor(y), tx = smooth(x - ix), ty = smooth(y - iy);
  const h = (a: number, b: number) => hash(wrap(a, cells), wrap(b, cells), seed);
  const a = h(ix, iy) * (1 - tx) + h(ix + 1, iy) * tx;
  const b = h(ix, iy + 1) * (1 - tx) + h(ix + 1, iy + 1) * tx;
  return a * (1 - ty) + b * ty;
}

/** Whole-period octaves: no non-integer frequency can split a tile seam. */
export function terrainDetailHeight(u: number, v: number): number {
  return periodic(u, v, 8, 71) * 0.45 + periodic(u, v, 32, 79) * 0.35 + periodic(u, v, 64, 83) * 0.2;
}

export function createTerrainDetailData(size: number): { normal: Uint8Array; detail: Uint8Array } {
  if (!Number.isInteger(size) || size < 16 || size > 1024 || (size & (size - 1)) !== 0) throw new Error('Terrain detail size must be a power of two from 16 to 1024');
  const normal = new Uint8Array(size * size * 4), detail = new Uint8Array(size * size * 4);
  const d = 1 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size, v = (y + 0.5) / size, i = (y * size + x) * 4;
    const h = terrainDetailHeight(u, v);
    const nx = -(terrainDetailHeight(u + d, v) - terrainDetailHeight(u - d, v)) * 2;
    const ny = -(terrainDetailHeight(u, v + d) - terrainDetailHeight(u, v - d)) * 2;
    const length = Math.hypot(nx, ny, 1);
    normal[i] = Math.round((nx / length * 0.5 + 0.5) * 255);
    normal[i + 1] = Math.round((ny / length * 0.5 + 0.5) * 255);
    normal[i + 2] = Math.round((1 / length * 0.5 + 0.5) * 255);
    normal[i + 3] = 255;
    detail[i] = Math.round(h * 255);
    detail[i + 1] = Math.round((0.87 + h * 0.12) * 255);
    detail[i + 2] = detail[i + 1];
    detail[i + 3] = 255;
  }
  return { normal, detail };
}

export interface TerrainDetailOptions { enabled: boolean; size: number; normalStrength?: number; contrast?: number; mownStrength?: number }
export const TERRAIN_DETAIL_PRESETS = {
  low: { enabled: false, size: 128 }, medium: { enabled: false, size: 256 }, high: { enabled: true, size: 512 },
} satisfies Record<string, TerrainDetailOptions>;

function texture(data: Uint8Array, size: number): THREE.DataTexture {
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.colorSpace = THREE.NoColorSpace;
  map.needsUpdate = true;
  return map;
}

/** White vertex-colour base retains the terrain's existing baked AO and palette. */
export function createTerrainMaterial(options: TerrainDetailOptions): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97, flatShading: false });
  material.name = 'terrain-smooth-detail';
  if (options.enabled) {
    const data = createTerrainDetailData(options.size);
    material.normalMap = texture(data.normal, options.size);
    material.roughnessMap = texture(data.detail, options.size);
    material.normalScale.setScalar(Math.max(0, options.normalStrength ?? 0.28));
  }
  const contrast = { value: Math.max(0, Math.min(1, options.contrast ?? 0.35)) };
  const mown = { value: Math.max(0, Math.min(1, options.mownStrength ?? 1)) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainMownStrength = mown;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 terrainCover;\nvarying vec3 vTerrainCover;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainCover = terrainCover;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainCover;\nuniform float terrainMownStrength;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float stripe = cos(vTerrainCover.z * 3.14159265 / ${TERRAIN_MOWN.width});
        float mown = stripe * ${TERRAIN_MOWN.contrast} * terrainMownStrength * clamp(vTerrainCover.x, 0.0, 1.0);
        mown *= (1.0 - smoothstep(0.0, ${TERRAIN_MOWN.reach}.0, max(0.0, vTerrainCover.y))) * step(0.0, vTerrainCover.y);
        diffuseColor.rgb *= 1.0 + mown;`);
    if (options.enabled) {
      shader.uniforms.terrainGrain = { value: material.roughnessMap };
      shader.uniforms.terrainContrast = contrast;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D terrainGrain;\nuniform float terrainContrast;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float grain = texture2D(terrainGrain, vRoughnessMapUv).r;
          diffuseColor.rgb *= mix(1.0, 0.88 + grain * 0.24, terrainContrast);`);
    }
  };
  material.customProgramCacheKey = () => `terrain-detail-v2:${options.enabled}`;
  return material;
}

/** Both generated RGBA8 maps, including full mip chains; excludes driver overhead. */
export function terrainDetailBytes(size: number): number { return Math.ceil(size * size * 8 * 4 / 3); }

export function disposeTerrainMaterial(material: THREE.MeshStandardMaterial): void {
  material.normalMap?.dispose();
  material.roughnessMap?.dispose();
  material.dispose();
}
