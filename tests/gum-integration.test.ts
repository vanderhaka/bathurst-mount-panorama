import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_GRAPHICS, QUALITY, resetGraphics, setGraphics } from '@/config/graphics';
import { clearPropCache, getPropAsset } from '@/props';
import { createGumLayer } from '@/world/scenery/gum-layer';
import { PropInstancer } from '@/world/scenery/instancer';
import { placeUnderTreeDetails } from '@/world/scenery/undergrowth';
import { SpatialMask } from '@/world/scenery/geo';
import { createShadowRig } from '@/world/shadows';
import type { Terrain } from '@/world/terrain';

afterEach(() => resetGraphics());
const terrain = (height = 100, clear = 10) => ({ heightAt: (x: number, z: number) => height + x * 0.01 + z * 0.02, clearance: () => clear }) as unknown as Terrain;

describe('world-owned gum integration', () => {
  it('owns a separate atlas/cache for each world while old and new builds overlap', () => {
    const first = createGumLayer('high'), next = createGumLayer('low');
    const a = first.getPropAsset('eucalyptus', 0), b = next.getPropAsset('eucalyptus', 0);
    expect(a.geometry).not.toBe(b.geometry); expect(a.material).not.toBe(b.material);
    const high = a.material as THREE.MeshStandardMaterial, low = b.material as THREE.MeshStandardMaterial;
    expect(high.map).not.toBe(low.map); expect(high.normalMap).not.toBeNull(); expect(low.normalMap).toBeNull();
    expect((high.map!.image as { width: number }).width).toBeLessThanOrEqual(1024);
    expect((low.map!.image as { width: number }).width).toBeLessThanOrEqual(256);
    let geometry = 0, maps = 0, material = 0;
    a.geometry.addEventListener('dispose', () => geometry++); high.map!.addEventListener('dispose', () => maps++); high.addEventListener('dispose', () => material++);
    first.dispose(); first.dispose(); expect([geometry, maps, material]).toEqual([1, 1, 1]);
    expect(next.getPropAsset('eucalyptus', 0)).toBe(b); next.dispose();
  });

  it('preserves gum attributes, shared shadow materials, wind bounds and LOD visibility in real scenery batches', () => {
    const layer = createGumLayer('high'), inst = new PropInstancer(layer.getPropAsset);
    for (const kind of ['eucalyptus', 'eucalyptusYoung', 'gumShrub', 'fallenBark'] as const) inst.add(kind, 0, 0, 0, 0);
    const stats = inst.build(); expect(stats).toEqual({ instances: 4, batches: 1 });
    const batch = inst.group.children[0] as THREE.BatchedMesh, asset = layer.getPropAsset('eucalyptus', 0);
    expect(batch.customDepthMaterial).toBe(asset.customDepthMaterial); expect(batch.customDistanceMaterial).toBe(asset.customDistanceMaterial);
    for (const name of ['uv', 'treeSurface', 'treeWind']) expect(batch.geometry.getAttribute(name)).toBeDefined();
    asset.geometry.computeBoundingBox(); const box = new THREE.Box3(); batch.getBoundingBoxAt(0, box);
    expect(box.max.x - asset.geometry.boundingBox!.max.x).toBeGreaterThan(1);
    const near = batch.getGeometryIdAt(0); inst.updateAll(new THREE.Vector3(500, 0, 0), 160, 1400);
    expect(batch.getGeometryIdAt(0)).toBe(near); expect(batch.getVisibleAt(0)).toBe(false);
    setGraphics({ treeWind: 0.6 }); layer.update(9);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
    asset.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.gumTime.value).toBe(9); expect(shader.uniforms.gumAmplitude.value).toBe(0.6);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(); scene.add(inst.group);
    const rig = createShadowRig(scene, camera, 'high'); rig.update();
    asset.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms).toHaveProperty('CSM_cascades'); expect(shader.uniforms).toHaveProperty('gumTime');
    let disposed = 0; batch.addEventListener('dispose', () => disposed++);
    inst.dispose(); inst.dispose(); layer.dispose(); expect(disposed).toBe(1);
    expect(asset.material.customProgramCacheKey()).not.toContain('|csm-'); rig.dispose();
  });

  it('crossfades one gum pair smoothly in its existing batch without changing tint or geometry', () => {
    const layer = createGumLayer('low'), inst = new PropInstancer(layer.getPropAsset);
    inst.add('eucalyptus', 0, 0, 0, 0, 0, 1, new THREE.Color(0.7, 0.8, 0.9));
    expect(inst.build()).toEqual({ instances: 1, batches: 1 });
    const batch = inst.group.children[0] as THREE.BatchedMesh, near = batch.getGeometryIdAt(0), c = new THREE.Vector4();
    inst.updateAll(new THREE.Vector3(140, 0, 0), 160, 1400);
    expect(batch.getVisibleAt(0)).toBe(true); expect(batch.getVisibleAt(1)).toBe(false);
    inst.updateAll(new THREE.Vector3(160, 0, 0), 160, 1400);
    expect(batch.getVisibleAt(0)).toBe(true); expect(batch.getVisibleAt(1)).toBe(true);
    batch.getColorAt(0, c); expect(c.w).toBeCloseTo(0.5); expect(c.x).toBeCloseTo(0.7);
    batch.getColorAt(1, c); expect(c.w).toBeCloseTo(-0.5); expect(c.z).toBeCloseTo(0.9);
    inst.updateAll(new THREE.Vector3(180, 0, 0), 160, 1400);
    expect(batch.getVisibleAt(0)).toBe(false); expect(batch.getVisibleAt(1)).toBe(true);
    expect(batch.getGeometryIdAt(0)).toBe(near);
    inst.updateAll(new THREE.Vector3(1500, 0, 0), 160, 1400);
    expect(batch.getVisibleAt(0)).toBe(false); expect(batch.getVisibleAt(1)).toBe(false);
    inst.dispose(); layer.dispose();
  });

  it('keeps wind and expensive maps off on phone tiers and honours rebuild switches', () => {
    expect(QUALITY.low.woodlandUndergrowth).toBe(false); expect(QUALITY.medium.treeBarkDetail).toBe(false);
    setGraphics({ treeWind: 1, treeBarkDetail: false });
    for (const tier of ['low', 'medium'] as const) {
      const layer = createGumLayer(tier), asset = layer.getPropAsset('eucalyptus', 0);
      layer.update(3);
      const shader = { vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>', uniforms: {} } as THREE.WebGLProgramParametersWithUniforms;
      asset.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
      expect(shader.uniforms.gumAmplitude.value).toBe(0); expect((asset.material as THREE.MeshStandardMaterial).normalMap).toBeNull(); layer.dispose();
    }
    expect(DEFAULT_GRAPHICS.treeWind).toBeGreaterThan(0);
  });

  it('places only bounded Mountain details with individual terrain heights and obstacle clearance', () => {
    const tree = { x: 100, z: 50, radius: 7, yaw: Math.PI / 2, scale: 1.2, seed: 12 };
    const calls: Array<{ kind: string; x: number; y: number; z: number }> = [];
    const add = (kind: string, _variant: number, x: number, y: number, z: number) => { calls.push({ kind, x, y, z }); };
    const target = { add } as unknown as PropInstancer, mask = new SpatialMask(), options = { enabled: true, density: 1, capacity: 4 };
    expect(placeUnderTreeDetails(terrain(), target, mask, tree, options)).toBe(4);
    expect(calls.some(p => p.kind === 'gumShrub')).toBe(true); expect(calls.some(p => p.kind === 'fallenBark')).toBe(true);
    for (const p of calls) { expect(p.y).toBeCloseTo(terrain().heightAt(p.x, p.z) + 0.015); expect(Math.hypot(p.x - tree.x, p.z - tree.z)).toBeLessThan(tree.radius * tree.scale); }
    calls.length = 0;
    for (const surface of [terrain(0), terrain(100, 1)]) expect(placeUnderTreeDetails(surface, target, mask, tree, options)).toBe(0);
    mask.add(tree.x, tree.z, 20); expect(placeUnderTreeDetails(terrain(), target, mask, tree, options)).toBe(0);
    expect(placeUnderTreeDetails(terrain(), target, new SpatialMask(), tree, { ...options, enabled: false })).toBe(0);
    expect(placeUnderTreeDetails(terrain(), target, new SpatialMask(), tree, { ...options, capacity: 0 })).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('keeps standalone prop previews alpha masked and releases their atlas on explicit cache disposal', () => {
    const a = getPropAsset('eucalyptus', 0), material = a.material as THREE.MeshStandardMaterial;
    expect(material.map).not.toBeNull(); expect(material.alphaTest).toBeGreaterThan(0);
    let disposed = 0; material.map!.addEventListener('dispose', () => disposed++);
    clearPropCache(false); expect(disposed).toBe(0); clearPropCache(true); expect(disposed).toBe(1);
    const b = getPropAsset('eucalyptus', 0); expect(b.material).not.toBe(a.material); clearPropCache(true);
  });
});
