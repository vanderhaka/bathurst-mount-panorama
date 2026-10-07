import * as THREE from 'three';
import { TRACKSIDE } from '@/art/palette';

export interface WallScuff { x: number; y: number; z: number; radius: number }
export interface WallWeatherOptions { amount: number; panels: boolean; scuffs: readonly WallScuff[] }
export const WALL_WEATHER_PRESETS = { low: 0, medium: 0.24, high: 0.45 } as const;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Multiplier only: existing albedo, paint and pre-baked contact shadows remain in charge. */
export function wallWeatherMultiplier(x: number, y: number, z: number, vertical: number, amount: number, scuffs: readonly WallScuff[]): number {
  const broad = Math.sin(x * 0.41) * Math.sin(z * 0.31 + 0.7) * 0.045;
  const grain = Math.sin(x * 27 + z * 19) * Math.sin(y * 31 + z * 7) * 0.018;
  const dirt = (1 - smooth((vertical - 0.1) / 0.4)) * 0.16;
  let impact = 0;
  for (const p of scuffs.slice(0, 12)) {
    const r = Math.max(0.1, p.radius);
    const near = 1 - smooth(Math.hypot(x - p.x, z - p.z) / r);
    impact = Math.max(impact, near * Math.exp(-(((y - p.y) / 0.22) ** 2)) * 0.5);
  }
  return 1 + clamp(amount, 0, 1) * (broad + grain - dirt - impact);
}

/** Clone before adding weather; shared concrete/sponsor maps are borrowed, never disposed. */
export function weatherTracksideMaterial(base: THREE.MeshStandardMaterial, options: WallWeatherOptions) {
  const material = base.clone();
  const weather = { value: clamp(options.amount, 0, 1) };
  const points = Array.from({ length: 12 }, (_, k) => {
    const p = options.scuffs[k];
    return p ? new THREE.Vector4(p.x, p.y, p.z, Math.max(0.1, p.radius)) : new THREE.Vector4(0, 0, 0, -1);
  });
  const previous = base.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uWallWeather = weather;
    shader.uniforms.uWallScuffs = { value: points };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      varying vec3 vWallPosition; varying float vWallHeight;`);
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vWallPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vWallHeight = uv.y;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uWallWeather; uniform vec4 uWallScuffs[12];
      varying vec3 vWallPosition; varying float vWallHeight;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float wallBroad = sin(vWallPosition.x * 0.41) * sin(vWallPosition.z * 0.31 + 0.7) * 0.045;
      vec2 wallPhase = vec2(vWallPosition.x * 27.0 + vWallPosition.z * 19.0, vWallPosition.y * 31.0 + vWallPosition.z * 7.0);
      float wallGrain = sin(wallPhase.x) * sin(wallPhase.y) * 0.018;
      wallGrain *= 1.0 - smoothstep(1.0, 3.0, max(fwidth(wallPhase.x), fwidth(wallPhase.y)));
      float wallDirt = ${options.panels ? '0.015' : '(1.0 - smoothstep(0.1, 0.5, vWallHeight)) * 0.16'};
      float wallImpact = 0.0;
      for (int i = 0; i < 12; i++) {
        vec4 mark = uWallScuffs[i];
        if (mark.w > 0.0) {
          float nearMark = 1.0 - smoothstep(0.0, mark.w, length(vWallPosition.xz - mark.xz));
          float markBand = exp(-pow((vWallPosition.y - mark.y) / 0.22, 2.0));
          wallImpact = max(wallImpact, nearMark * markBand * 0.5);
        }
      }
      diffuseColor.rgb *= 1.0 + uWallWeather * (wallBroad + wallGrain - wallDirt - wallImpact);
      ${options.panels ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), uWallWeather * 0.06);' : ''}`);
  };
  material.customProgramCacheKey = () => `trackside-weather-1:${options.panels}:${base.customProgramCacheKey()}`;
  let disposed = false;
  return {
    material,
    setAmount: (amount: number) => { weather.value = clamp(amount, 0, 1); },
    dispose: () => { if (!disposed) { disposed = true; material.dispose(); } },
  };
}

export interface FenceWireDimensions { tileMetres: number; diamondMetres: number; wireMetres: number }
export interface CatchFenceOptions extends FenceWireDimensions { size: number; msaa: boolean }
export const CATCH_FENCE_PRESETS = {
  low: { enabled: false, size: 128, tileMetres: 0.5, diamondMetres: 0.0625, wireMetres: 0.0025 },
  medium: { enabled: true, size: 128, tileMetres: 0.5, diamondMetres: 0.0625, wireMetres: 0.0025 },
  high: { enabled: true, size: 256, tileMetres: 0.5, diamondMetres: 0.0625, wireMetres: 0.0025 },
} as const;

/** Integer diamonds per tile avoid seams; dimensions are metres rather than screen pixels. */
export function fenceWireCoverage(u: number, v: number, dimensions: FenceWireDimensions): number {
  const tile = clamp(dimensions.tileMetres, 0.1, 2);
  const cells = Math.round(clamp(tile / Math.max(0.015, dimensions.diamondMetres), 2, 32));
  const distance = (phase: number) => Math.abs(phase - Math.round(phase)) * tile / cells / Math.SQRT2;
  const d = Math.min(distance((u + v) * cells), distance((u - v) * cells));
  return d <= clamp(dimensions.wireMetres, 0.001, 0.01) / 2 ? 1 : 0;
}

export function createFenceWireData(size: number, dimensions: FenceWireDimensions): Uint8Array {
  if (!Number.isInteger(size) || size < 32 || size > 1024 || (size & (size - 1))) throw new RangeError('Fence size must be a power of two from 32 to 1024');
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0;
    for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) coverage += fenceWireCoverage((x + ox) / size, (y + oy) / size, dimensions);
    const k = (y * size + x) * 4, value = Math.round(coverage * 255 / 4);
    data[k] = data[k + 1] = data[k + 2] = value;
    data[k + 3] = 255;
  }
  return data;
}

/** Existing fence UVs repeat twice per metre: retain tileMetres=.5 or rescale those UVs. */
export function createCatchFenceMaterial(options: CatchFenceOptions) {
  const alphaMap = new THREE.DataTexture(createFenceWireData(options.size, options), options.size, options.size);
  alphaMap.colorSpace = THREE.NoColorSpace;
  alphaMap.wrapS = alphaMap.wrapT = THREE.RepeatWrapping;
  alphaMap.generateMipmaps = true;
  alphaMap.minFilter = THREE.LinearMipmapLinearFilter;
  alphaMap.magFilter = THREE.LinearFilter;
  alphaMap.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    color: TRACKSIDE.fenceMesh, alphaMap, alphaTest: 0.22, alphaToCoverage: options.msaa,
    transparent: false, side: THREE.DoubleSide, roughness: 0.68, metalness: 0.35,
  });
  let disposed = false;
  return { material, dispose: () => { if (!disposed) { disposed = true; alphaMap.dispose(); material.dispose(); } } };
}
