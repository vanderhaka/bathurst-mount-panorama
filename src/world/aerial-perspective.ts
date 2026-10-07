import * as THREE from 'three';
import { getGraphics, type GraphicsConfig } from '@/config/graphics';
import { SUN_DIRECTION } from '@/world/sky';

/** Exponential density above the circuit's 700 m elevation datum, bounded underground. */
export function heightDensity(height: number, falloff: number): number {
  return Math.exp(-Math.max(-2, Math.min(20, height * falloff)));
}

export interface AerialPerspective {
  apply(cfg: GraphicsConfig): void;
  prepare(camera: THREE.Camera): void;
  setEnabled(enabled: boolean): void;
}

const vertex = /* glsl */ `
  #ifdef USE_FOG
    vec4 bathurstFogPosition = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      bathurstFogPosition = batchingMatrix * bathurstFogPosition;
    #endif
    #ifdef USE_INSTANCING
      bathurstFogPosition = instanceMatrix * bathurstFogPosition;
    #endif
    vBathurstFogPosition = (modelMatrix * bathurstFogPosition).xyz;
  #endif
`;

const fragment = /* glsl */ `
  #ifdef USE_FOG
    vec3 bathurstRay = vBathurstFogPosition - cameraPosition;
    float bathurstDistance = length(bathurstRay);
    float startHeight = clamp(cameraPosition.y * hazeFalloff, -2.0, 20.0);
    float endHeight = clamp(vBathurstFogPosition.y * hazeFalloff, -2.0, 20.0);
    float heightDelta = endHeight - startHeight;
    // Integrate exponential density over the ray; stable for a horizontal view.
    float meanDensity = abs(heightDelta) < 0.001 ? hazeCameraDensity
      : hazeCameraDensity * (1.0 - exp(-heightDelta)) / heightDelta;
    float bathurstHaze = 1.0 - exp(-fogDensity * bathurstDistance * meanDensity);
    float sunward = pow(max(dot(bathurstRay / max(bathurstDistance, 0.001), hazeSunDirection), 0.0), 8.0);
    vec3 bathurstHazeColour = mix(fogColor, hazeSunColour, sunward * hazeWarmth * 0.45);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, bathurstHazeColour, bathurstHaze);
  #endif
`;

/**
 * Adds height/distance haze to existing fog materials. Uniforms are shared, and
 * existing fence/material hooks survive. Fog blends in linear HDR before output.
 */
export function createAerialPerspective(scene: THREE.Scene): AerialPerspective {
  const cfg0 = getGraphics();
  const uniforms = {
    hazeFalloff: { value: cfg0.hazeHeightFalloff },
    hazeCameraDensity: { value: 1 },
    hazeSunDirection: { value: SUN_DIRECTION },
    hazeSunColour: { value: new THREE.Color(cfg0.sunColour) },
    hazeWarmth: { value: cfg0.hazeSunWarmth },
  };
  const materials = new Set<THREE.Material>();
  const installed = new WeakSet<THREE.Material>();
  let enabled = true;
  const position = new THREE.Vector3();

  function install(material: THREE.Material): void {
    if (materials.has(material) || !('fog' in material) || !material.fog) return;
    materials.add(material);
    if (installed.has(material)) return;
    installed.add(material);
    material.addEventListener('dispose', () => materials.delete(material));
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey();
    material.customProgramCacheKey = () => `${previousKey}:bathurst-haze:${enabled}`;
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      if (!enabled) return;
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\n#ifdef USE_FOG\nvarying vec3 vBathurstFogPosition;\n#endif')
        .replace('#include <fog_vertex>', vertex);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>
          #ifdef USE_FOG
            varying vec3 vBathurstFogPosition;
            uniform float hazeFalloff, hazeCameraDensity, hazeWarmth;
            uniform vec3 hazeSunDirection, hazeSunColour;
          #endif`)
        .replace('#include <fog_fragment>', '')
        .replace('#include <tonemapping_fragment>', `${fragment}\n#include <tonemapping_fragment>`);
    };
    material.needsUpdate = true;
  }

  return {
    prepare(camera) {
      camera.getWorldPosition(position);
      uniforms.hazeCameraDensity.value = heightDensity(position.y, uniforms.hazeFalloff.value);
      // Also catches rebuilt worlds, cars and particles added after scene setup.
      scene.traverseVisible((object) => {
        if (!('material' in object)) return;
        const value = object.material as THREE.Material | THREE.Material[];
        if (Array.isArray(value)) value.forEach(install); else install(value);
      });
    },
    apply(cfg) {
      uniforms.hazeFalloff.value = cfg.hazeHeightFalloff;
      uniforms.hazeSunColour.value.set(cfg.sunColour);
      uniforms.hazeWarmth.value = cfg.hazeSunWarmth;
    },
    setEnabled(next) {
      if (next === enabled) return;
      enabled = next;
      for (const material of materials) material.needsUpdate = true;
    },
  };
}
