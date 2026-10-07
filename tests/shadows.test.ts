import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createShadowRig } from '@/world/shadows';
import { createLighting } from '@/world/lighting';
import { DEFAULT_GRAPHICS } from '@/config/graphics';

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
