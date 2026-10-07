import * as THREE from 'three';
import { SKY } from '@/art/palette';
import type { QualityPreset } from '@/render/renderer';
import { SUN_DIRECTION } from '@/world/sky';

export interface SceneLighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Moves the shadow frustum so that it covers `focus` (call every frame). */
  follow(focus: THREE.Vector3): void;
  setQuality(q: QualityPreset): void;
}

const SHADOW: Record<QualityPreset, { size: number; extent: number }> = {
  low: { size: 1024, extent: 45 },
  medium: { size: 2048, extent: 60 },
  high: { size: 4096, extent: 80 },
};

export function createLighting(scene: THREE.Scene, quality: QualityPreset = 'high'): SceneLighting {
  scene.fog = new THREE.FogExp2(SKY.haze, 0.00011);

  const hemi = new THREE.HemisphereLight(0xe2e9ee, 0x7d7458, 1.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(SKY.sun, 3.1);
  sun.castShadow = true;
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.04;
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
  const lightSpace = new THREE.Matrix4().lookAt(new THREE.Vector3(), SUN_DIRECTION.clone().negate(), new THREE.Vector3(0, 1, 0));
  const inv = lightSpace.clone().invert();
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
    },
  };
}

/** Builds an environment map from the sky so that car paint and glass get sky reflections. */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer, skyDome: THREE.Mesh): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const dome = skyDome.clone();
  dome.position.set(0, 0, 0);
  dome.scale.setScalar(0.01);
  envScene.add(dome);
  // A darker lower hemisphere so reflections show "ground" below the horizon.
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(60, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x5d6a3f }),
  );
  ground.position.y = -2;
  envScene.add(ground);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 200);
  pmrem.dispose();
  return rt.texture;
}
