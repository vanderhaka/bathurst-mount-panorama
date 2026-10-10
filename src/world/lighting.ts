import * as THREE from 'three';
import { getGraphics, QUALITY, type GraphicsConfig } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import { SUN_DIRECTION } from '@/world/sky';
import { createAerialPerspective } from '@/world/aerial-perspective';
import { createShadowRig } from '@/world/shadows';
import { addEnvSurroundings, disposeEnvSurroundings } from '@/world/env-surroundings';

export interface SceneLighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Refits the shadow cascades to the camera and keeps `focus` inside them (call every frame). */
  follow(focus: THREE.Vector3): void;
  /** Installs the cascade and haze shader hooks on a subtree that is not in the scene yet (for precompiling it). */
  prepare(object: THREE.Object3D): void;
  setQuality(q: QualityPreset): void;
  /** Applies live graphics values (intensities, colours, fog). Call after Sky.apply(). */
  apply(cfg: GraphicsConfig): void;
  resize(): void;
  dispose(): void;
}

export function createLighting(scene: THREE.Scene, quality: QualityPreset = 'high', camera = new THREE.PerspectiveCamera(62, 1, 0.1, 16000)): SceneLighting {
  const cfg0 = getGraphics();
  const fog = new THREE.FogExp2(cfg0.fogColour, cfg0.fogDensity);
  scene.fog = fog;
  const aerial = createAerialPerspective();
  const previousRender = scene.onBeforeRender;
  scene.onBeforeRender = (renderer, renderedScene, camera, ...rest) => {
    previousRender.call(scene, renderer, renderedScene, camera, ...rest);
    aerial.prepare(camera);
  };

  const hemi = new THREE.HemisphereLight(cfg0.hemiSky, cfg0.hemiGround, cfg0.hemiIntensity);
  scene.add(hemi);

  const shadows = createShadowRig(scene, camera, quality, aerial.install);
  return {
    get sun() { return shadows.sun; },
    hemi,
    // Haze owns the inner shader hook (installed as the shadow rig registers a material); CSM wraps it,
    // so changing cascades cannot erase it.
    follow(focus) { shadows.update(focus); },
    prepare(object) { shadows.register(object); },
    resize() { shadows.resize(); },
    dispose() { shadows.dispose(); scene.remove(hemi); scene.onBeforeRender = previousRender; },
    setQuality(q) {
      quality = q;
      shadows.setQuality(q);
      aerial.setEnabled(getGraphics().aerialPerspective && QUALITY[q].aerialPerspective);
    },
    apply(cfg) {
      shadows.apply(SUN_DIRECTION, cfg.sunIntensity, cfg.sunColour, cfg.shadowDistance);
      hemi.intensity = cfg.hemiIntensity;
      hemi.color.set(cfg.hemiSky);
      hemi.groundColor.set(cfg.hemiGround);
      fog.color.set(cfg.fogColour);
      fog.density = cfg.fogDensity;
      aerial.apply(cfg);
      aerial.setEnabled(cfg.aerialPerspective && QUALITY[quality].aerialPerspective);
      scene.environmentIntensity = cfg.envIntensity;
    },
  };
}

/**
 * Builds an environment map for car paint and glass: procedural sky, optional outdoor HDRI,
 * and proxy asphalt / grass / hills so reflections show surroundings, not only the sky.
 */
export function createSkyEnvironment(
  renderer: THREE.WebGLRenderer,
  skyDome: THREE.Mesh,
  quality: QualityPreset = 'high',
  hdri: THREE.Texture | null = null,
): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const dome = skyDome.clone();
  // The live dome draws last with a depth test (see sky.ts); here it stays the backdrop drawn first.
  dome.renderOrder = -10;
  dome.position.set(0, 0, 0);
  dome.scale.multiplyScalar(0.01);
  envScene.add(dome);

  let hdriMesh: THREE.Mesh | null = null;
  if (hdri) {
    // Equirect backdrop under the sky dome: outdoor trees/road fill the lower hemisphere.
    hdriMesh = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.MeshBasicMaterial({ map: hdri, side: THREE.BackSide, fog: false, depthWrite: false, opacity: 0.72, transparent: true }),
    );
    hdriMesh.renderOrder = -20;
    envScene.add(hdriMesh);
  }

  const surroundings = addEnvSurroundings(envScene);
  const material = skyDome.material;
  const sunDisc = material instanceof THREE.ShaderMaterial ? material.uniforms.showSunDisc : undefined;
  const visibleSun = sunDisc?.value, backdrop = skyDome.material as THREE.Material, depthTest = backdrop.depthTest;
  if (sunDisc) sunDisc.value = 0; // Avoid a second sharp sun in filtered reflections.
  backdrop.depthTest = false;
  try {
    return pmrem.fromScene(envScene, 0, 0.1, 220, { size: QUALITY[quality].environmentSize });
  } finally {
    if (sunDisc) sunDisc.value = visibleSun;
    backdrop.depthTest = depthTest;
    pmrem.dispose();
    disposeEnvSurroundings(surroundings);
    if (hdriMesh) {
      hdriMesh.geometry.dispose();
      (hdriMesh.material as THREE.Material).dispose();
    }
  }
}
