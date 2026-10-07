import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { grassHeight, grassLayout, GRASS_PRESETS, type GrassGround } from '@/world/grass-layout';
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
