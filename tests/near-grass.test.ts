import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createGrassLayout, grassHeight, grassLayout, GRASS_PRESETS, type GrassGround } from '@/world/grass-layout';
import { createNearGrass } from '@/world/near-grass';

const ground = (x: number, z: number): GrassGround => ({ x, z, height: 3, normalY: 1, trackDistance: 20, lateral: 25, clearance: 15 });
const settings = { ...GRASS_PRESETS.high, capacity: 80, radius: 12 };

describe('camera-near grass', () => {
  it('is deterministic, bounded and seated on the sampled surface', () => {
    const a = grassLayout(0, 0, ground, settings), b = grassLayout(0, 0, ground, settings);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(a.length).toBeLessThanOrEqual(80);
    expect(a.every(p => Math.hypot(p.x, p.z) <= settings.radius && p.y === 2.98)).toBe(true);
    expect(a.every(p => p.height > 0 && p.height < 0.5)).toBe(true);
  });

  it('rejects the road, wall contact, steep banks and bare mineral surfaces', () => {
    expect(grassLayout(0, 0, (x, z) => ({ ...ground(x, z), trackDistance: -1 }), settings)).toEqual([]);
    expect(grassLayout(0, 0, (x, z) => ({ ...ground(x, z), clearance: 0.2 }), settings)).toEqual([]);
    expect(grassLayout(0, 0, (x, z) => ({ ...ground(x, z), normalY: 0.5 }), settings)).toEqual([]);
  });

  it('keeps a shorter mown verge, supports tier density and disables phone allocations', () => {
    expect(grassHeight(2, 0.5)).toBeLessThan(grassHeight(30, 0.5));
    expect(grassLayout(0, 0, ground, { ...settings, density: 0 })).toEqual([]);
    expect(GRASS_PRESETS.low.enabled).toBe(false);
    expect(GRASS_PRESETS.medium.enabled).toBe(false);
    const off = createNearGrass(ground, GRASS_PRESETS.low);
    expect(off.group.children).toHaveLength(0);
    off.update(2, 3, 5);
    off.dispose();
  });

  it('reuses one bounded instance draw and only rebuilds when the camera changes patch', () => {
    const grass = createNearGrass(ground, settings);
    grass.update(0, 0, 1);
    expect(grass.group.children).toHaveLength(1);
    const mesh = grass.mesh;
    expect(mesh).toBeDefined();
    expect(mesh?.count).toBeGreaterThan(0);
    expect(mesh?.count).toBeLessThanOrEqual(80);
    const version = mesh?.instanceMatrix.version;
    grass.update(1, 1, 2);
    expect(mesh?.instanceMatrix.version).toBe(version);
    grass.update(20, 0, 3);
    expect(mesh?.instanceMatrix.version).toBeGreaterThan(version ?? 0);
    grass.dispose();
  });

  it('moves the patch incrementally with exactly the full layout and samples only the new edge', () => {
    let calls = 0;
    // Uneven ground: banks, the road and the barrier reject some candidates.
    const uneven = (x: number, z: number): GrassGround => {
      calls++;
      return { x, z, height: 0.05 * x - 0.02 * z, normalY: 0.9 + 0.1 * Math.abs(Math.sin(x * 0.11 + z * 0.07)),
        trackDistance: 12 * Math.sin(z * 0.03) + 4, lateral: x, clearance: 3 + Math.cos(x * 0.05) * 2 };
    };
    const wide = { ...GRASS_PRESETS.high, radius: 30, capacity: 600 };
    const incremental = createGrassLayout(uneven, wide);
    const path = [[0, 0], [8, 0], [16, 8], [24, 16], [24, 24], [-40, 64], [-32, 64], [0, 0]];
    let full = 0, step = 0;
    for (const [i, [cx, cz]] of path.entries()) {
      calls = 0;
      const blades = incremental(cx, cz);
      if (i === 1) step = calls;
      calls = 0;
      expect(blades).toEqual(grassLayout(cx, cz, uneven, wide));
      if (i === 1) full = calls;
      expect(blades.length).toBeGreaterThan(0);
    }
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThan(full * 0.35);
  });

  it('updates shader time and wind without rebuilding the blades, then disposes once', () => {
    const grass = createNearGrass(ground, settings);
    const mesh = grass.mesh;
    expect(mesh).toBeDefined();
    if (!mesh) return;
    const shader = {
      uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as THREE.WebGLProgramParametersWithUniforms;
    mesh.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    grass.update(0, 0, 4);
    grass.setWind(0);
    grass.update(1, 1, 8);
    expect(shader.uniforms.grassTime.value).toBe(8);
    expect(shader.uniforms.grassWind.value).toBe(0);
    expect(shader.uniforms.grassFocus.value.toArray()).toEqual([1, 1]);
    let disposed = 0;
    mesh.geometry.addEventListener('dispose', () => disposed++);
    mesh.material.addEventListener('dispose', () => disposed++);
    grass.dispose();
    grass.dispose();
    expect(disposed).toBe(2);
    expect(grass.group.children).toHaveLength(0);
  });
});
