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
/**
 * Cascades past the first re-render on alternate frames (High: one of the two far maps per frame), which removes a
 * third of the shadow passes. A skipped map keeps the light matrix it was drawn with, so it stays exact, only a frame
 * old. It re-renders at once when its light box has drifted this share of its width since it was drawn (a fast turn
 * or a camera cut) or when the car stands in it (a distant TV camera), so moving shadows never update at half rate.
 */
const STAGGER_DRIFT = 0.02;
/** Depth margin (share of the cascade's range) that counts the car as inside a cascade; fades overlap the splits. */
const FOCUS_MARGIN = 0.15;

/**
 * Keeps material shader hooks intact when the add-on installs CSM uniforms. `visit` sees every material in
 * the scene just before the cascades wrap it; lighting installs the haze there.
 */
export function createShadowRig(scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: QualityPreset,
  visit?: (material: THREE.Material) => void) {
  const originals = new Map<THREE.Material, { compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey']; release: () => void }>();
  let direction = new THREE.Vector3(0.4, -0.6, -0.4).normalize();
  let intensity = 3, colour = '#fff1dc', distance = 400;
  const fitted = { fov: 0, near: 0, aspect: 0, zoom: 0, far: 0 };
  const eye = new THREE.Vector3(), forward = new THREE.Vector3(), toFocus = new THREE.Vector3();
  /** Light position each cascade was last drawn from; null forces a draw (new cascades, a refit). */
  let drawn: (THREE.Vector3 | null)[] = [];
  let frame = 0;
  /** The tier's reach, shortened by the tuner's shadow distance. */
  const reach = () => Math.min(distance, QUALITY[quality].shadowDistance);
  const fit = (far: number) => {
    csm.maxFar = far;
    csm.updateFrustums();
    Object.assign(fitted, { fov: camera.fov, near: camera.near, aspect: camera.aspect, zoom: camera.zoom, far });
    // New splits and box sizes: every map must match them in the same frame.
    drawn = [];
  };
  const make = () => {
    const tier = QUALITY[quality];
    const result = new CSM({ camera, parent: scene, cascades: tier.cascades, maxFar: reach(),
      mode: 'practical', shadowMapSize: tier.shadowMap, shadowBias: tier.shadowBias,
      lightDirection: direction, lightIntensity: intensity, lightNear: 1, lightFar: 1600, lightMargin: 100 });
    result.fade = true;
    for (const light of result.lights) {
      light.color.set(colour); light.shadow.normalBias = tier.shadowNormalBias;
      light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
    }
    drawn = [];
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
  /** Marks the cascades to redraw this frame (after csm.update(), which placed each light box). */
  const schedule = (focus?: THREE.Vector3) => {
    frame++;
    const far = Math.min(camera.far, csm.maxFar);
    let depth = -1;
    if (focus) depth = camera.getWorldDirection(forward).dot(toFocus.copy(focus).sub(eye.setFromMatrixPosition(camera.matrixWorld)));
    csm.lights.forEach((light, i) => {
      const shadow = light.shadow, last = drawn[i];
      const lo = (csm.breaks[i - 1] ?? 0) * far, hi = (csm.breaks[i] ?? 1) * far, margin = (hi - lo) * FOCUS_MARGIN;
      const due = i === 0 || !last || (frame + i) % 2 === 0
        || last.distanceTo(light.position) > (shadow.camera.right - shadow.camera.left) * STAGGER_DRIFT
        || (depth > lo - margin && depth < hi + margin);
      if (!due) return;
      shadow.needsUpdate = true;
      (drawn[i] ??= new THREE.Vector3()).copy(light.position);
    });
  };
  const registerMaterial = (material: THREE.Material, mesh: boolean) => {
    // Inner hooks (haze) go in first: a tier change restores exactly what was here, so they survive it.
    visit?.(material);
    if (!mesh || !(material instanceof THREE.MeshStandardMaterial) || originals.has(material)) return;
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
  };
  /** Hidden objects too (the ghost car is added hidden), so every material is seen before its first draw. */
  const registerObject = (object: THREE.Object3D) => {
    if (!('material' in object)) return;
    const value = object.material as THREE.Material | THREE.Material[] | null | undefined, mesh = object instanceof THREE.Mesh;
    if (Array.isArray(value)) for (const material of value) registerMaterial(material, mesh);
    else if (value) registerMaterial(value, mesh);
  };
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
    update(focus?: THREE.Vector3) { scene.traverse(registerObject); camera.updateMatrixWorld(); refitIfStale(focus); csm.update(); schedule(focus); },
    /** Installs the cascade and haze hooks on a subtree before it joins the scene (shader precompiles). */
    register(object: THREE.Object3D) { object.traverse(registerObject); },
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
