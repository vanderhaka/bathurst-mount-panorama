import * as THREE from 'three';
import { ROAD } from '@/art/palette';
import type { SpeedProfile } from '@/track/speed-profile';
import { generateAsphaltMaps, generateWeatherMap } from '@/world/asphalt-maps';
import { clamp01, sealTextureEdges, smoothStep, surfaceNoise } from '@/world/surface-noise';

/** Look constants for the road shader and kerb texture; strengths the graphics config does not own. */
export const ROAD_LOOK = {
  /** Diffuse multiplier loss at full rubber (on top of the vertex tint). */
  rubberDarken: 0.5,
  /** Roughness in the rubbered groove (off the line the map gives 0.72-0.86). */
  grooveRoughness: 0.48,
  /** Broad wear bands / fresh patches: +-fraction of albedo and roughness. */
  wearAlbedo: 0.22,
  wearRoughness: 0.1,
  streakAlbedo: 0.1,
  /** Second normal tile: scale relative to the first, rotation (rad) and weight. */
  normalTile2: 0.37,
  normalRotate2: 0.62,
  normalWeight2: 0.85,
  kerbRoughness: 0.6,
};

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
    normalStrength: options.normalStrength ?? 0.9,
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
      ${weather ? 'uniform sampler2D roadWeatherMap; uniform float roadRepairs;' : ''}
      ${options.surfaceDetail ? `vec3 roadNormalSample(sampler2D map, vec2 uv) {
        float c = cos(${ROAD_LOOK.normalRotate2.toFixed(3)}), s = sin(${ROAD_LOOK.normalRotate2.toFixed(3)});
        vec3 a = texture2D(map, uv).xyz;
        vec3 b = texture2D(map, mat2(c, -s, s, c) * uv * ${ROAD_LOOK.normalTile2.toFixed(3)} + vec2(0.31, 0.17)).xyz;
        a.xy += (b.xy - 0.5) * ${ROAD_LOOK.normalWeight2.toFixed(3)};
        return a;
      }` : ''}\n` + shader.fragmentShader;
    if (options.surfaceDetail) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv ).xyz', 'roadNormalSample( normalMap, vNormalMapUv )'));
    }
    if (weather) {
      shader.uniforms.roadWeatherMap = { value: weather };
      shader.uniforms.roadRepairs = { value: options.repairStrength };
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec2 roadWeather = texture2D(roadWeatherMap, vRoadWeatherUv).rg * roadRepairs;
        diffuseColor.rgb *= (1.0 - 0.12 * roadWeather.r) * (1.0 - 0.42 * roadWeather.g);
        vec2 roadWear = texture2D(roadWeatherMap, vRoadWeatherUv).ba;
        diffuseColor.rgb *= 1.0 + ${ROAD_LOOK.wearAlbedo.toFixed(3)} * (roadWear.x - 0.5) * 2.0 - ${ROAD_LOOK.streakAlbedo.toFixed(3)} * (roadWear.y - 0.4);`);
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      ${weather ? `roughnessFactor = mix(roughnessFactor, 0.75, roadWeather.r * 0.7); roughnessFactor = mix(roughnessFactor, 0.55, roadWeather.g * 0.85);
      roughnessFactor += ${ROAD_LOOK.wearRoughness.toFixed(3)} * (roadWear.x - 0.5) * 2.0;` : ''}
      float roadGroove = smoothstep(0.0, 0.6, clamp(vRoadRubber, 0.0, 1.0));
      roughnessFactor = mix(roughnessFactor, ${ROAD_LOOK.grooveRoughness.toFixed(3)}, roadGroove);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb *= 1.0 - ${ROAD_LOOK.rubberDarken.toFixed(3)} * smoothstep(0.0, 0.6, clamp(vRoadRubber, 0.0, 1.0));`);
  };
  road.customProgramCacheKey = () => `road-surface-v2:${weather ? 1 : 0}:${options.surfaceDetail ? 1 : 0}`;

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
  const kerb = new THREE.MeshStandardMaterial({ map: kerbMap, vertexColors: true, roughness: ROAD_LOOK.kerbRoughness });
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
    // Kerb texture u = 0 is the road (apex) side: paint wears and rubbers most there.
    const apex = kerb ? 1 - smoothStep(0, 0.5, u) : 0;
    const chip = Math.min(1, smoothStep(0.64 - apex * 0.3, 0.79 - apex * 0.22, noise) * wear * (1 + apex * 0.5));
    const rubber = kerb ? (1 - smoothStep(0, 0.3, u)) * (0.25 + 0.35 * surfaceNoise(u, v, 16, 99)) * wear : 0;
    const colour = kerb ? (v < 0.5 ? red : white) : [255, 255, 255];
    for (let c = 0; c < 3; c++) data[i + c] = Math.round((colour[c] * (1 - chip) + bare[c] * chip) * (0.97 + grain * 0.03) * (1 - rubber * 0.6));
    // Sparse entire-line gaps plus small chips; kerb wear exposes concrete instead.
    const gap = !kerb && (surfaceNoise(0, v, 32, 111) < 0.045 * wear || grain < 0.1 * wear);
    data[i + 3] = gap ? 0 : 255;
  }
  sealTextureEdges(data, size);
  return data;
}
