import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createShadowRig } from '@/world/shadows';
import { createLighting } from '@/world/lighting';
import { DEFAULT_GRAPHICS, QUALITY } from '@/config/graphics';

it('preserves material shader hooks through cascade changes and disposal', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial();
  let calls = 0;
  const custom = () => { calls++; };
  material.onBeforeCompile = custom;
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const rig = createShadowRig(scene, camera, 'high');
  rig.update();
  const shader = { uniforms: {} } as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(calls).toBe(1);
  expect(shader.uniforms).toHaveProperty('CSM_cascades');
  const highKey = material.customProgramCacheKey();
  rig.setQuality('medium');
  rig.update();
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  expect(calls).toBe(2);
  expect(material.customProgramCacheKey()).not.toBe(highKey);
  expect(scene.children.filter(o => o instanceof THREE.DirectionalLight)).toHaveLength(2);
  rig.dispose();
  expect(material.onBeforeCompile).toBe(custom);
  expect(scene.children.filter(o => o instanceof THREE.DirectionalLight)).toHaveLength(0);
});

it('keeps aerial perspective installed across High, Low and Medium cascade changes', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const lighting = createLighting(scene, 'high', camera);
  for (const tier of ['high', 'low', 'medium'] as const) {
    lighting.setQuality(tier);
    lighting.apply(DEFAULT_GRAPHICS);
    lighting.follow(new THREE.Vector3());
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader } as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms).toHaveProperty('CSM_cascades');
    expect('hazeFalloff' in shader.uniforms).toBe(tier !== 'low');
  }
  lighting.dispose();
});

it('keeps haze on a material first seen while hidden (the ghost car) across tier changes', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const material = new THREE.MeshStandardMaterial();
  const ghost = new THREE.Mesh(new THREE.BoxGeometry(), material);
  ghost.visible = false;
  scene.add(ghost);
  const lighting = createLighting(scene, 'high', camera);
  lighting.apply(DEFAULT_GRAPHICS);
  lighting.follow(new THREE.Vector3());
  ghost.visible = true;
  lighting.follow(new THREE.Vector3());
  for (const tier of ['medium', 'high', 'low', 'medium'] as const) {
    lighting.setQuality(tier);
    lighting.apply(DEFAULT_GRAPHICS);
    lighting.follow(new THREE.Vector3());
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader } as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms, tier).toHaveProperty('CSM_cascades');
    expect('hazeFalloff' in shader.uniforms, tier).toBe(tier !== 'low');
  }
  lighting.dispose();
});

it('walks the scene once per frame and leaves the haze to a camera uniform', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  for (let i = 0; i < 20; i++) scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  const lighting = createLighting(scene, 'medium', camera);
  lighting.apply(DEFAULT_GRAPHICS);
  const walk = vi.spyOn(scene, 'traverse'), visibleWalk = vi.spyOn(scene, 'traverseVisible');
  lighting.follow(new THREE.Vector3());
  scene.onBeforeRender({} as THREE.WebGLRenderer, scene, camera, new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), new THREE.Group());
  expect(walk).toHaveBeenCalledTimes(1);
  expect(visibleWalk).not.toHaveBeenCalled();
  lighting.dispose();
});

const view = (fov = 62, near = 0.1) => {
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, near, 16000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -10);
  camera.updateMatrixWorld();
  return camera;
};

describe('cascade fit', () => {
  it('keeps near-car shadow texels at about 10 cm on every tier, with tier bias from QUALITY', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      const rig = createShadowRig(new THREE.Scene(), view(), tier);
      rig.update(new THREE.Vector3(0, 0, -6));
      expect(rig.texels[0], tier).toBeLessThanOrEqual(0.1);
      expect(rig.coverage).toBe(QUALITY[tier].shadowDistance);
      expect(rig.sun.shadow.normalBias).toBe(QUALITY[tier].shadowNormalBias);
      expect(rig.sun.shadow.bias).toBe(QUALITY[tier].shadowBias);
      rig.dispose();
    }
  });

  it('refits to a narrow trackside view and still covers the distant car on Low', () => {
    const camera = view();
    const rig = createShadowRig(new THREE.Scene(), camera, 'low');
    rig.update(new THREE.Vector3(0, 0, -6));
    // Fitted to 62°, one cascade spans about 2.5 times its reach.
    expect(rig.texels[0] * QUALITY.low.shadowMap).toBeGreaterThan(rig.coverage * 2.3);
    camera.fov = 14; camera.near = 0.5; camera.updateProjectionMatrix();
    const car = new THREE.Vector3(0, 0, -150);
    rig.update(car);
    expect(rig.coverage).toBeGreaterThan(car.distanceTo(camera.position));
    // Refitted to the narrow view, the cascade hugs the frustum's length instead.
    expect(rig.texels[0] * QUALITY.low.shadowMap).toBeLessThan(rig.coverage * 1.1);
    const sun = rig.sun;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    sun.shadow.updateMatrices(sun);
    const uv = car.clone().applyMatrix4(sun.shadow.matrix);
    expect(Math.min(uv.x, uv.y)).toBeGreaterThan(0);
    expect(Math.max(uv.x, uv.y)).toBeLessThan(1);
    // A free camera far from the car keeps a bounded reach instead of stretching its texels.
    rig.update(new THREE.Vector3(0, 0, -2000));
    expect(rig.coverage).toBe(300);
    rig.dispose();
  });

  it('lets the tuner shorten, but not lengthen, a tier reach', () => {
    const rig = createShadowRig(new THREE.Scene(), view(), 'medium');
    rig.apply(new THREE.Vector3(0, 1, 0), 3, '#ffffff', 800);
    rig.update();
    expect(rig.coverage).toBe(QUALITY.medium.shadowDistance);
    rig.apply(new THREE.Vector3(0, 1, 0), 3, '#ffffff', 30);
    rig.update();
    expect(rig.coverage).toBe(30);
    rig.dispose();
  });
});
