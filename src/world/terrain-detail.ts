import * as THREE from 'three';
import { TERRAIN_MOWN } from '@/world/terrain-surface';
import { TERRAIN_COLOUR_GLSL, createTerrainAlbedoTexture } from '@/world/terrain-albedo';

/** Detail tile sizes in metres (UV on the mesh is world / 8) and the shader's colour-variation strength. */
export const TERRAIN_LOOK = { normalStrength: 0.5, contrast: 0.65, colourVariation: 0.85, fineTile: 1.5, coarseTile: 9, normalTile: 2, normalFineTile: 0.5 };

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

export interface TerrainDetailOptions { enabled: boolean; size: number; normalStrength?: number; contrast?: number; mownStrength?: number; colourVariation?: number }
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
  let albedo: THREE.DataTexture | null = null;
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97, flatShading: false });
  material.name = 'terrain-smooth-detail';
  if (options.enabled) {
    const data = createTerrainDetailData(options.size);
    material.normalMap = texture(data.normal, options.size);
    material.roughnessMap = texture(data.detail, options.size);
    material.normalScale.setScalar(Math.max(0, options.normalStrength ?? TERRAIN_LOOK.normalStrength));
    material.normalMap.repeat.setScalar(8 / TERRAIN_LOOK.normalTile);
    albedo = createTerrainAlbedoTexture(options.size);
    material.userData.terrainAlbedo = albedo;
  }
  const contrast = { value: Math.max(0, Math.min(1, options.contrast ?? TERRAIN_LOOK.contrast)) };
  const mown = { value: Math.max(0, Math.min(1, options.mownStrength ?? 1)) };
  const variation = { value: Math.max(0, Math.min(1.5, options.colourVariation ?? TERRAIN_LOOK.colourVariation)) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainMownStrength = mown;
    shader.uniforms.terrainVariation = variation;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 terrainCover;\nvarying vec3 vTerrainCover;\nvarying vec2 vTerrainWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTerrainCover = terrainCover;\nvTerrainWorld = uv * 8.0;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTerrainCover;\nvarying vec2 vTerrainWorld;\nuniform float terrainMownStrength;\nuniform float terrainVariation;' + TERRAIN_COLOUR_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float stripe = cos(vTerrainCover.z * 3.14159265 / ${TERRAIN_MOWN.width});
        float mown = stripe * ${TERRAIN_MOWN.contrast} * terrainMownStrength * clamp(vTerrainCover.x, 0.0, 1.0);
        mown *= (1.0 - smoothstep(0.0, ${TERRAIN_MOWN.reach}.0, max(0.0, vTerrainCover.y))) * step(0.0, vTerrainCover.y);
        diffuseColor.rgb *= 1.0 + mown;
        diffuseColor.rgb *= terrainTint(vTerrainWorld, terrainVariation * mix(0.5, 1.0, clamp(vTerrainCover.x, 0.0, 1.0)));`);
    if (options.enabled) {
      shader.uniforms.terrainGrain = { value: material.roughnessMap };
      shader.uniforms.terrainAlbedo = { value: albedo };
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
        vec3 mapF = texture2D( normalMap, mat2(0.80, -0.60, 0.60, 0.80) * vTerrainWorld / ${TERRAIN_LOOK.normalFineTile.toFixed(2)} ).xyz * 2.0 - 1.0;
        mapN = normalize(vec3(mapN.xy + mapF.xy * 0.7, mapN.z));`));
      shader.uniforms.terrainContrast = contrast;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D terrainGrain;\nuniform sampler2D terrainAlbedo;\nuniform float terrainContrast;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float grain = texture2D(terrainGrain, vRoughnessMapUv).r;
          diffuseColor.rgb *= mix(1.0, 0.8 + grain * 0.4, terrainContrast);
          vec2 tw = vTerrainWorld;
          vec4 fineT = texture2D(terrainAlbedo, tw / ${TERRAIN_LOOK.fineTile.toFixed(2)});
          vec4 coarseT = texture2D(terrainAlbedo, mat2(0.87, -0.50, 0.50, 0.87) * tw / ${TERRAIN_LOOK.coarseTile.toFixed(2)} + 0.37);
          float veg = clamp(vTerrainCover.x, 0.0, 1.0);
          vec3 detailA = mix(vec3(4.0 * fineT.a * coarseT.a), 4.0 * fineT.rgb * coarseT.rgb, veg);
          diffuseColor.rgb *= mix(vec3(1.0), detailA, terrainContrast);`);
    }
  };
  material.customProgramCacheKey = () => `terrain-detail-v3:${options.enabled}`;
  return material;
}

/**
 * Lets a non-terrain mesh (vineyard rows, verge strips) share the terrain material: world-scaled UVs and a constant
 * cover (1 = vegetation, 0 = dirt/gravel; no mown stripes) are the only attributes its shader reads besides colour.
 */
export function applyTerrainAttributes(geometry: THREE.BufferGeometry, vegetation: number, heightSkew = 0): void {
  const pos = geometry.getAttribute('position');
  const uv = new Float32Array(pos.count * 2), cover = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // heightSkew shifts the UVs with height so steep faces (vine row sides) do not smear the texture.
    uv[i * 2] = (pos.getX(i) + pos.getY(i) * heightSkew) / 8; uv[i * 2 + 1] = (pos.getZ(i) + pos.getY(i) * heightSkew * 0.6) / 8;
    cover[i * 3] = vegetation; cover[i * 3 + 1] = 1e4;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('terrainCover', new THREE.BufferAttribute(cover, 3));
}

/** Both generated RGBA8 maps, including full mip chains; excludes driver overhead. */
export function terrainDetailBytes(size: number): number { return Math.ceil(size * size * 8 * 4 / 3); }

export function disposeTerrainMaterial(material: THREE.MeshStandardMaterial): void {
  material.normalMap?.dispose();
  material.roughnessMap?.dispose();
  material.userData.terrainAlbedo?.dispose();
  material.dispose();
}
