import * as THREE from 'three';
import { getGraphics, QUALITY, type GraphicsConfig } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import { SUN_DIRECTION } from '@/world/sky';
import { createAerialPerspective } from '@/world/aerial-perspective';
import { createShadowRig } from '@/world/shadows';

export interface SceneLighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  /** Refits the shadow cascades to the camera and keeps `focus` inside them (call every frame). */
  follow(focus: THREE.Vector3): void;
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

const GROUND_NADIR = new THREE.Color(0x1d1b15);
const GROUND_HORIZON = new THREE.Color(0x3d3a2c);

/** Disc of warm dark ground: darkest straight below, lifting to the horizon so the horizon line reads in paint. */
function groundGeometry(radius: number): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(radius, 48).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.min(1, Math.hypot(pos.getX(i), pos.getZ(i)) / radius);
    c.copy(GROUND_NADIR).lerp(GROUND_HORIZON, Math.pow(t, 0.6)).toArray(col, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
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
  const ground = new THREE.Mesh(groundGeometry(85), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  ground.position.y = -1;
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
