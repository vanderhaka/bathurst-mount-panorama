import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTerrainDetailData, createTerrainMaterial, disposeTerrainMaterial, terrainDetailHeight } from '@/world/terrain-detail';

describe('generated terrain detail', () => {
  it('uses whole periods so both tile seams wrap continuously', () => {
    for (const u of [-0.3, 0, 0.231, 1]) for (const v of [-0.8, 0, 0.631]) {
      expect(terrainDetailHeight(u, v)).toBeCloseTo(terrainDetailHeight(u + 1, v), 11);
      expect(terrainDetailHeight(u, v)).toBeCloseTo(terrainDetailHeight(u, v + 1), 11);
    }
    expect(terrainDetailHeight(-0.00001, 0.2)).toBeCloseTo(terrainDetailHeight(0.00001, 0.2), 3);
  });

  it('produces deterministic, opaque normals and roughness within a bounded allocation', () => {
    const a = createTerrainDetailData(32), b = createTerrainDetailData(32);
    expect(a.normal).toEqual(b.normal);
    expect(a.detail).toEqual(b.detail);
    expect(a.normal.length + a.detail.length).toBe(32 * 32 * 8);
    for (let i = 0; i < a.normal.length; i += 4) {
      const x = a.normal[i] / 127.5 - 1, y = a.normal[i + 1] / 127.5 - 1, z = a.normal[i + 2] / 127.5 - 1;
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
      expect(a.normal[i + 3]).toBe(255);
      expect(a.detail[i + 1]).toBeGreaterThanOrEqual(220);
      expect(a.detail[i + 3]).toBe(255);
    }
    expect(() => createTerrainDetailData(1)).toThrow();
  });

  it('uses a white smooth base, has an off switch and frees generated maps', () => {
    const off = createTerrainMaterial({ enabled: false, size: 32 });
    expect(off.flatShading).toBe(false);
    expect(off.vertexColors).toBe(true);
    expect(off.color.getHex()).toBe(0xffffff);
    expect(off.normalMap).toBeNull();
    const on = createTerrainMaterial({ enabled: true, size: 32, normalStrength: 0.2 });
    expect(on.normalMap?.wrapS).toBe(THREE.RepeatWrapping);
    expect(on.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(on.normalScale.x).toBe(0.2);
    let disposed = 0;
    on.normalMap?.addEventListener('dispose', () => disposed++);
    on.roughnessMap?.addEventListener('dispose', () => disposed++);
    disposeTerrainMaterial(on);
    expect(disposed).toBe(2);
  });

  it('keeps mowing detail in the shader so coarse vertices do not alias the stripes', () => {
    const material = createTerrainMaterial({ enabled: false, size: 32, mownStrength: 0.6 });
    const shader = {
      uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.uniforms.terrainMownStrength.value).toBe(0.6);
    expect(shader.vertexShader).toContain('vTerrainCover = terrainCover');
    expect(shader.fragmentShader).toContain('vTerrainCover.z');
    expect(shader.fragmentShader).not.toContain('texture2D(terrainGrain');
    material.dispose();
  });
});
