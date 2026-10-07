import * as THREE from 'three';
import { ROAD } from '@/art/palette';
import type { SpeedProfile } from '@/track/speed-profile';
import { generateAsphaltMaps, generateWeatherMap } from '@/world/asphalt-maps';
import { clamp01, sealTextureEdges, smoothStep, surfaceNoise } from '@/world/surface-noise';

/** The caller supplies QUALITY/config values; no new gameplay or tuning state lives here. */
export interface RoadOptions {
  detailSize?: number;
  surfaceDetail?: boolean;
  normalStrength?: number;
  repairStrength?: number;
  rubberGroove?: number;
  skids?: boolean;
  kerbWear?: number;
  lineWear?: number;
  profile?: SpeedProfile;
}

export function roadOptions(options: RoadOptions, rubberGroove: number): Required<Omit<RoadOptions, 'profile'>> {
  const size = Number.isFinite(options.detailSize) ? options.detailSize! : 1024;
  return {
    detailSize: 2 ** Math.floor(Math.log2(Math.max(32, Math.min(1024, size)))),
    surfaceDetail: options.surfaceDetail ?? true,
    normalStrength: options.normalStrength ?? 0.65,
    repairStrength: clamp01(options.repairStrength ?? 0.8),
    rubberGroove: clamp01(options.rubberGroove ?? rubberGroove),
    skids: options.skids ?? true,
    kerbWear: clamp01(options.kerbWear ?? 0.7),
    lineWear: clamp01(options.lineWear ?? 0.6),
  };
}

export interface RoadMaterials {
  road: THREE.MeshStandardMaterial;
  paint: THREE.MeshStandardMaterial;
  kerb: THREE.MeshStandardMaterial;
  skid: THREE.MeshStandardMaterial;
  meanLinear: number;
  dispose: () => void;
}

export function createRoadMaterials(renderer: THREE.WebGLRenderer, length: number, options: ReturnType<typeof roadOptions>): RoadMaterials {
  const textures: THREE.Texture[] = [];
  const make = (data: Uint8Array, size: number, colour = false): THREE.DataTexture => {
    const texture = new THREE.DataTexture(data, size, size);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    textures.push(texture);
    return texture;
  };
  const maps = generateAsphaltMaps(options.detailSize);
  const albedo = make(maps.albedo, maps.size, true);
  albedo.repeat.y = Math.round(length / 4) * 4 / length;
  const normal = options.surfaceDetail ? make(maps.normal, maps.size) : null;
  const roughness = options.surfaceDetail ? make(maps.roughness, maps.size) : null;
  for (const texture of [normal, roughness]) if (texture) texture.repeat.copy(albedo.repeat);
  const weather = options.repairStrength > 0 ? make(generateWeatherMap(maps.size), maps.size) : null;
  const road = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: albedo, normalMap: normal, roughnessMap: roughness,
    normalScale: new THREE.Vector2(options.normalStrength, options.normalStrength),
    vertexColors: true, roughness: options.surfaceDetail ? 1 : 0.87, metalness: 0,
  });
  road.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float roadRubber; attribute vec2 roadWeatherUv;
      varying float vRoadRubber; varying vec2 vRoadWeatherUv;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n vRoadRubber = roadRubber; vRoadWeatherUv = roadWeatherUv;');
    shader.fragmentShader = `varying float vRoadRubber; varying vec2 vRoadWeatherUv;
      ${weather ? 'uniform sampler2D roadWeatherMap; uniform float roadRepairs;' : ''}\n` + shader.fragmentShader;
    if (weather) {
      shader.uniforms.roadWeatherMap = { value: weather };
      shader.uniforms.roadRepairs = { value: options.repairStrength };
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 roadWeather = texture2D(roadWeatherMap, vRoadWeatherUv).rg * roadRepairs;
        diffuseColor.rgb *= (1.0 - 0.12 * roadWeather.r) * (1.0 - 0.42 * roadWeather.g);`);
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      ${weather ? 'roughnessFactor = mix(roughnessFactor, 0.75, roadWeather.r * 0.7); roughnessFactor = mix(roughnessFactor, 0.55, roadWeather.g * 0.85);' : ''}
      roughnessFactor = mix(roughnessFactor, 0.52, clamp(vRoadRubber, 0.0, 1.0));`);
  };
  road.customProgramCacheKey = () => `road-surface-v1:${weather ? 1 : 0}`;

  const paintSize = Math.min(256, options.detailSize);
  const paintMap = make(paintData(paintSize, options.lineWear, false), paintSize, true);
  // 0.25 m across, 12 m along; close the lap seam with a whole number of periods.
  paintMap.repeat.set(4, Math.round(length / 12) / length);
  const paint = new THREE.MeshStandardMaterial({
    color: ROAD.lineWhite, map: paintMap, vertexColors: true, roughness: 0.78,
    alphaTest: 0.15, alphaToCoverage: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const kerbMap = make(paintData(paintSize, options.kerbWear, true), paintSize, true);
  kerbMap.repeat.y = Math.round(length / 3.2) * 3.2 / length;
  const kerb = new THREE.MeshStandardMaterial({ map: kerbMap, vertexColors: true, roughness: 0.8, flatShading: true });
  const skid = new THREE.MeshStandardMaterial({
    color: ROAD.groove, map: paintMap, vertexColors: true, roughness: 0.7,
    transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  let disposed = false;
  return { road, paint, kerb, skid, meanLinear: maps.meanLinear, dispose: () => {
    if (disposed) return;
    disposed = true;
    for (const material of [road, paint, kerb, skid]) material.dispose();
    for (const texture of textures) texture.dispose();
  } };
}

function paintData(size: number, wear: number, kerb: boolean): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const rgb = (hex: number): number[] => [(hex >>> 16) & 255, (hex >>> 8) & 255, hex & 255];
  const red = rgb(ROAD.kerbRed), white = rgb(ROAD.kerbWhite), bare = rgb(0x73736f);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / (size - 1), v = y / (size - 1), i = (y * size + x) * 4;
    const noise = surfaceNoise(u, v, 48, 93), grain = surfaceNoise(u, v, 64, 95);
    const chip = smoothStep(0.64, 0.79, noise) * wear;
    const colour = kerb ? (v < 0.5 ? red : white) : [255, 255, 255];
    for (let c = 0; c < 3; c++) data[i + c] = Math.round((colour[c] * (1 - chip) + bare[c] * chip) * (0.97 + grain * 0.03));
    // Sparse entire-line gaps plus small chips; kerb wear exposes concrete instead.
    const gap = !kerb && (surfaceNoise(0, v, 32, 111) < 0.045 * wear || grain < 0.1 * wear);
    data[i + 3] = gap ? 0 : 255;
  }
  sealTextureEdges(data, size);
  return data;
}
