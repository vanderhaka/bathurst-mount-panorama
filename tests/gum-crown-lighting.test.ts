import { expect, it } from 'vitest';
import * as THREE from 'three';
import { buildEucalyptus } from '@/props/trees';
import { createGumMaterials } from '@/props/trees/gum-materials';
import { gumLodWeights, gumDitherKeeps } from '@/props/trees/gum-lod';

it('gives every leaf in a crown the same radial lighting field at both LODs', () => {
  const tree = buildEucalyptus(0), bounds = new THREE.Box3(), point = new THREE.Vector3();
  const p = tree.near.getAttribute('position'), surface = tree.near.getAttribute('treeSurface');
  for (let i = 0; i < p.count; i++) if (surface.getX(i) >= 2) bounds.expandByPoint(point.fromBufferAttribute(p, i));
  const centre = bounds.getCenter(new THREE.Vector3()), radii = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (const g of [tree.near, tree.far]) {
    const p = g.getAttribute('position'), s = g.getAttribute('treeSurface'), n = g.getAttribute('normal');
    for (let i = 0; i < p.count; i++) if (s.getX(i) >= 2) {
      const expected = point.fromBufferAttribute(p, i).sub(centre).divide(radii);
      expect(new THREE.Vector3().fromBufferAttribute(n, i).distanceTo(expected)).toBeLessThan(1e-4);
    }
    g.dispose();
  }
});

it('crossfades complementary pixels continuously over 30 metres', () => {
  expect(gumLodWeights(80, 100)).toEqual({ near: 1, far: 0 });
  expect(gumLodWeights(100, 100)).toEqual({ near: 0.5, far: 0.5 });
  expect(gumLodWeights(120, 100)).toEqual({ near: 0, far: 1 });
  for (const distance of [85, 90, 100, 110, 115]) {
    const weights = gumLodWeights(distance, 100);
    for (let pixel = 0; pixel < 256; pixel++) {
      const noise = (pixel + 0.5) / 256;
      expect(Number(gumDitherKeeps(weights.near, noise)) + Number(gumDitherKeeps(-weights.far, noise))).toBe(1);
    }
  }
});

it('preserves tint/atlas/wind hooks while visible and shadow shaders share signed-alpha dither', () => {
  const bundle = createGumMaterials({ atlasSize: 256, barkDetail: false });
  for (const [material, lib] of [[bundle.material, THREE.ShaderLib.standard], [bundle.depthMaterial, THREE.ShaderLib.depth], [bundle.distanceMaterial, THREE.ShaderLib.distance]] as const) {
    const shader = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('gumWindOffset');
    expect(shader.vertexShader).toContain('vGumLod');
    expect(shader.fragmentShader).toContain('vGumLod < 0.0');
    expect(shader.fragmentShader).toContain('gumAtlasUv');
    expect(material.transparent).toBe(false);
    if (material === bundle.material) {
      expect(shader.vertexShader).toContain('vGumCrown');
      expect(shader.fragmentShader).toContain('sqrt(max(0.06');
      expect(shader.vertexShader).toContain('propsLeafTint');
      expect(shader.fragmentShader).toContain('receiveShadow && vTreeSurface < 1.5');
    }
  }
  bundle.dispose();
});
