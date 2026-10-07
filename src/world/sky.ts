import * as THREE from 'three';
import { Sky as PhysicalSky } from 'three/addons/objects/Sky.js';
import { getGraphics, QUALITY, sunDirection, type GraphicsConfig } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import { applyTunedDome, createTunedDome } from '@/world/sky-dome';

/** Mutated in place so sunlight, atmosphere and reflections use the same clock. */
export const SUN_DIRECTION = new THREE.Vector3(...sunDirection(getGraphics()));
export const SKY_GRAPHICS_KEYS: (keyof GraphicsConfig)[] = [
  'timeOfDay', 'physicalSky', 'sunColour', 'skyZenith', 'skyHorizon',
  'skyTurbidity', 'skyRayleigh', 'skyMie', 'cloudCoverage',
];

export interface Sky {
  readonly dome: THREE.Mesh;
  follow(camera: THREE.Camera): void;
  apply(cfg: GraphicsConfig): void;
  setQuality(quality: QualityPreset): void;
}

export function createSky(scene: THREE.Scene, radius = 9000, quality: QualityPreset = 'high'): Sky {
  const physical = new PhysicalSky();
  physical.scale.setScalar(radius * 2);
  physical.material.depthTest = false;
  // Native procedural clouds replace the geometric puffs and stay on High only.
  physical.material.uniforms.cloudSpeed.value = 0;
  physical.material.uniforms.cloudElevation.value = 0.35;
  const tuned = createTunedDome(radius, SUN_DIRECTION);
  for (const mesh of [physical, tuned]) {
    mesh.name = 'sky-dome';
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
  }
  let cfg = getGraphics();
  let dome: THREE.Mesh = tuned;
  const apply = (next: GraphicsConfig) => {
    cfg = next;
    SUN_DIRECTION.set(...sunDirection(cfg));
    const uniforms = physical.material.uniforms;
    uniforms.sunPosition.value.copy(SUN_DIRECTION);
    uniforms.turbidity.value = cfg.skyTurbidity;
    uniforms.rayleigh.value = cfg.skyRayleigh;
    uniforms.mieCoefficient.value = cfg.skyMie;
    uniforms.mieDirectionalG.value = 0.8;
    uniforms.cloudCoverage.value = cfg.cloudCoverage;
    applyTunedDome(tuned.material, cfg);
    const nextDome = cfg.physicalSky && QUALITY[quality].physicalSky ? physical : tuned;
    if (nextDome !== dome) {
      nextDome.position.copy(dome.position);
      scene.remove(dome);
      dome = nextDome;
    }
    if (dome.parent !== scene) scene.add(dome);
  };
  apply(cfg);
  return {
    get dome() { return dome; },
    follow(camera) { dome.position.copy(camera.position); },
    apply,
    setQuality(next) { quality = next; apply(cfg); },
  };
}
