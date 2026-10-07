import * as THREE from 'three';
import { getGraphics, QUALITY, type GraphicsConfig } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import { SUN_DIRECTION } from '@/world/sky';
import { createAerialPerspective } from '@/world/aerial-perspective';

export interface SceneLighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Moves the shadow frustum so that it covers `focus` (call every frame). */
  follow(focus: THREE.Vector3): void;
  setQuality(q: QualityPreset): void;
  /** Applies live graphics values (intensities, colours, fog). Call after Sky.apply(). */
  apply(cfg: GraphicsConfig): void;
}

const SHADOW: Record<QualityPreset, { size: number; extent: number }> = {
  low: { size: 1024, extent: 45 },
  medium: { size: 2048, extent: 60 },
  high: { size: 4096, extent: 80 },
};

export function createLighting(scene: THREE.Scene, quality: QualityPreset = 'high'): SceneLighting {
  const cfg0 = getGraphics();
  const fog = new THREE.FogExp2(cfg0.fogColour, cfg0.fogDensity);
  scene.fog = fog;
  const aerial = createAerialPerspective(scene);
  const previousRender = scene.onBeforeRender;
  scene.onBeforeRender = (renderer, renderedScene, camera, ...rest) => {
    previousRender.call(scene, renderer, renderedScene, camera, ...rest);
    aerial.prepare(camera);
  };

  const hemi = new THREE.HemisphereLight(cfg0.hemiSky, cfg0.hemiGround, cfg0.hemiIntensity);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(cfg0.sunColour, cfg0.sunIntensity);
  sun.castShadow = true;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.09;
  scene.add(sun);
  scene.add(sun.target);

  const apply = (q: QualityPreset) => {
    const { size, extent } = SHADOW[q];
    sun.shadow.mapSize.set(size, size);
    const cam = sun.shadow.camera;
    cam.left = -extent;
    cam.right = extent;
    cam.top = extent;
    cam.bottom = -extent;
    cam.near = 1;
    cam.far = 900;
    cam.updateProjectionMatrix();
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  };
  apply(quality);

  const snapped = new THREE.Vector3();
  const lightSpace = new THREE.Matrix4();
  const inv = new THREE.Matrix4();
  const updateLightSpace = () => {
    lightSpace.lookAt(new THREE.Vector3(), SUN_DIRECTION.clone().negate(), new THREE.Vector3(0, 1, 0));
    inv.copy(lightSpace).invert();
  };
  updateLightSpace();
  return {
    sun,
    hemi,
    follow(focus) {
      // Snap the focus to the shadow-map texel grid (in light space) to stop shimmer.
      const { size, extent } = SHADOW[quality];
      const texel = (extent * 2) / size;
      snapped.copy(focus).applyMatrix4(inv);
      snapped.x = Math.round(snapped.x / texel) * texel;
      snapped.y = Math.round(snapped.y / texel) * texel;
      snapped.applyMatrix4(lightSpace);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).addScaledVector(SUN_DIRECTION, 400);
      sun.target.updateMatrixWorld();
    },
    setQuality(q) {
      quality = q;
      apply(q);
      aerial.setEnabled(getGraphics().aerialPerspective && QUALITY[q].aerialPerspective);
    },
    apply(cfg) {
      updateLightSpace();
      sun.intensity = cfg.sunIntensity;
      sun.color.set(cfg.sunColour);
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

/** Builds an environment map from the sky so that car paint and glass get sky reflections. */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer, skyDome: THREE.Mesh, quality: QualityPreset = 'high'): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const dome = skyDome.clone();
  dome.position.set(0, 0, 0);
  dome.scale.multiplyScalar(0.01);
  envScene.add(dome);
  // A darker lower hemisphere so reflections show "ground" below the horizon.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5d6a3f }),
  );
  ground.position.y = -2;
  envScene.add(ground);
  const material = skyDome.material;
  const sunDisc = material instanceof THREE.ShaderMaterial ? material.uniforms.showSunDisc : undefined;
  const visibleSun = sunDisc?.value;
  if (sunDisc) sunDisc.value = 0; // Avoid a second sharp sun in filtered reflections.
  try {
    return pmrem.fromScene(envScene, 0, 0.1, 200, { size: QUALITY[quality].environmentSize });
  } finally {
    if (sunDisc) sunDisc.value = visibleSun;
    pmrem.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
  }
}
