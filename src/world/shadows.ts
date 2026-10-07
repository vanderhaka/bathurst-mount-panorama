import * as THREE from 'three';
import { CSM } from 'three/addons/csm/CSM.js';
import type { QualityPreset } from '@/render/renderer';
import { QUALITY } from '@/config/graphics';

/** Keeps material shader hooks intact when the add-on installs CSM uniforms. */
export function createShadowRig(scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualityPreset) {
  const originals = new Map<THREE.Material, { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey']; release: () => void }>();
  let direction = new THREE.Vector3(0.4, -0.6, -0.4).normalize();
  let intensity = 3, colour = '#fff1dc', distance = 400;
  const make = () => {
    const tier = QUALITY[quality];
    const result = new CSM({ camera, parent: scene, cascades: tier.cascades, maxFar: distance,
      mode: 'practical', shadowMapSize: tier.shadowMap, shadowBias: -0.000002,
      lightDirection: direction, lightIntensity: intensity, lightNear: 1, lightFar: 1600, lightMargin: 100 });
    result.fade = true;
    for (const light of result.lights) { light.color.set(colour); light.shadow.normalBias = 0.035; }
    result.updateFrustums();
    return result;
  };
  let csm = make();
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
    update() { register(); camera.updateMatrixWorld(); csm.update(); },
    setQuality(q: QualityPreset) { if (q !== quality) { clear(); quality = q; csm = make(); } },
    apply(sun: THREE.Vector3, power: number, tint: string, maxFar: number) {
      direction = sun.clone().negate(); intensity = power; colour = tint;
      csm.lightDirection.copy(direction);
      for (const light of csm.lights) { light.intensity = intensity; light.color.set(colour); }
      if (distance !== maxFar) { distance = maxFar; csm.maxFar = distance; csm.updateFrustums(); }
    },
    resize() { csm.updateFrustums(); },
    dispose: clear,
  };
}
