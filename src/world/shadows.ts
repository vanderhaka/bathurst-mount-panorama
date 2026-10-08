import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import type { QualityPreset } from '@/render/renderer';
import { QUALITY } from '@/config/graphics';

/**
 * The cascades reach past the focus (the car) when a trackside camera stands farther away than the tier's
 * reach, up to `max` metres (TV cameras stay within about 200 m; a free camera far away keeps sharp shadows).
 */
const FOCUS_REACH = { scale: 1.15, margin: 10, max: 300 };
/** Relative change in field of view or reach that refits the cascades to the camera. */
const REFIT = 0.04;

/** Keeps material shader hooks intact when the add-on installs CSM uniforms. */
export function createShadowRig(scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualityPreset) {
  const originals = new Map<THREE.Material, { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey']; release: () => void }>();
  let direction = new THREE.Vector3(0.4, -0.6, -0.4).normalize();
  let intensity = 3, colour = '#fff1dc', distance = 400;
  const fitted = { fov: 0, near: 0, aspect: 0, zoom: 0, far: 0 };
  const eye = new THREE.Vector3();
  /** The tier's reach, shortened by the tuner's shadow distance. */
  const reach = () => Math.min(distance, QUALITY[quality].shadowDistance);
  const fit = (far: number) => {
    csm.maxFar = far;
    csm.updateFrustums();
    Object.assign(fitted, { fov: camera.fov, near: camera.near, aspect: camera.aspect, zoom: camera.zoom, far });
  };
  const make = () => {
    const tier = QUALITY[quality];
    const result = new CSM({ camera, parent: scene, cascades: tier.cascades, maxFar: reach(),
      mode: 'practical', shadowMapSize: tier.shadowMap, shadowBias: tier.shadowBias,
      lightDirection: direction, lightIntensity: intensity, lightNear: 1, lightFar: 1600, lightMargin: 100 });
    result.fade = true;
    for (const light of result.lights) { light.color.set(colour); light.shadow.normalBias = tier.shadowNormalBias; }
    return result;
  };
  let csm = make();
  fit(reach());
  /** Cascades are sized for the projection they were fitted to; the rig changes FOV (6–74°) and near plane per view. */
  const refitIfStale = (focus?: THREE.Vector3) => {
    eye.setFromMatrixPosition(camera.matrixWorld);
    const far = Math.max(reach(), focus ? Math.min(FOCUS_REACH.max, eye.distanceTo(focus) * FOCUS_REACH.scale + FOCUS_REACH.margin) : 0);
    const moved = (now: number, then: number) => Math.abs(now - then) > then * REFIT;
    if (moved(camera.fov, fitted.fov) || moved(far, fitted.far) || camera.near !== fitted.near
      || camera.aspect !== fitted.aspect || camera.zoom !== fitted.zoom) fit(far);
  };
  const register = () => scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || originals.has(material)) continue;
      const original = material.onBeforeCompile;
      const originalKey = material.customProgramCacheKey;
      const release = () => {
        csm.shaders.delete(material); originals.delete(material);
        material.onBeforeCompile = original; material.customProgramCacheKey = originalKey;
        if (material.defines) { delete material.defines.USE_CSM; delete material.defines.CSM_CASCADES; delete material.defines.CSM_FADE; }
        material.removeEventListener('dispose', release);
      };
      originals.set(material, { compile: original, key: originalKey, release });
      material.addEventListener('dispose', release);
      csm.setupMaterial(material);
      const install = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => { install.call(material, shader, renderer); original.call(material, shader, renderer); };
      material.customProgramCacheKey = () => `${originalKey.call(material)}|csm-${QUALITY[quality].cascades}`;
      material.needsUpdate = true;
    }
  });
  const clear = () => {
    csm.remove();
    for (const light of csm.lights) light.shadow.dispose();
    csm.dispose();
    for (const [material, original] of originals) {
      material.onBeforeCompile = original.compile; material.customProgramCacheKey = original.key;
      material.removeEventListener('dispose', original.release);
    }
    originals.clear();
  };
  return {
    get sun(): THREE.DirectionalLight { return csm.lights[0]; },
    /** Distance from the camera (m) that the cascades currently cover. */
    get coverage(): number { return fitted.far; },
    /** Texel edge (m) of each cascade's shadow map, nearest first. */
    get texels(): number[] { return csm.lights.map(light => (light.shadow.camera.right - light.shadow.camera.left) / light.shadow.mapSize.x); },
    update(focus?: THREE.Vector3) { register(); camera.updateMatrixWorld(); refitIfStale(focus); csm.update(); },
    setQuality(q: QualityPreset) { if (q !== quality) { clear(); quality = q; csm = make(); fit(reach()); } },
    apply(sun: THREE.Vector3, power: number, tint: string, maxFar: number) {
      direction = sun.clone().negate(); intensity = power; colour = tint;
      csm.lightDirection.copy(direction);
      for (const light of csm.lights) { light.intensity = intensity; light.color.set(colour); }
      if (distance !== maxFar) { distance = maxFar; fit(reach()); }
    },
    resize() { fit(fitted.far); },
    dispose: clear,
  };
}
