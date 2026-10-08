import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTowers, type TowerSpec, type TowerStyle } from '@/world/gold-coast-towers';

// A CPU-only canvas stands in for the browser's, as in the car texture tests.
function fakeCanvas() {
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const ctx = new Proxy({ canvas }, {
    get(target, key) {
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return key in target ? Reflect.get(target, key) : () => {};
    },
  });
  return canvas;
}

beforeEach(() => vi.stubGlobal('document', { createElement: fakeCanvas }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const STYLES: TowerStyle[] = ['glass', 'concrete', 'balcony'];
function specs(): TowerSpec[] {
  return Array.from({ length: 20 }, (_, i) => ({
    x: i * 60 - 600, z: (i % 5) * 70, width: 22 + (i % 4) * 6, depth: 24 + (i % 3) * 5,
    height: i === 7 ? 322 : 25 + ((i * 47) % 250), yaw: i * 0.37, style: STYLES[i % 3], seed: i + 1,
  }));
}
const meshes = (g: THREE.Group) => g.children as THREE.Mesh[];
const tris = (g: THREE.Group) => meshes(g).reduce((n, m) => n + m.geometry.getAttribute('position').count / 3, 0);

describe('gold coast towers', () => {
  it('merges 20 mixed towers into few cheap meshes up to 322 m with a spire', () => {
    const group = buildTowers(specs(), 'high');
    expect(group.name).toBe('gold-coast-towers');
    expect(meshes(group).length).toBeLessThanOrEqual(4);
    expect(tris(group)).toBeLessThanOrEqual(20 * 60);
    let maxY = 0; let spireY = 0;
    for (const m of meshes(group)) {
      m.geometry.computeBoundingBox();
      maxY = Math.max(maxY, m.geometry.boundingBox!.max.y);
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(true);
    }
    expect(Math.abs(maxY - 322)).toBeLessThanOrEqual(0.5);
    const roof = meshes(group).find(m => m.name === 'gold-coast-towers-roof')!;
    const y = roof.geometry.getAttribute('position');
    for (let i = 0; i < y.count; i++) spireY = Math.max(spireY, y.getY(i));
    expect(spireY).toBeGreaterThan(0.78 * 322 + 50);
  });

  it('builds an empty group from no specs', () => {
    const group = buildTowers([], 'low');
    expect(group.children).toHaveLength(0);
    expect(() => (group.userData.dispose as () => void)()).not.toThrow();
  });

  it('is deterministic', () => {
    const a = buildTowers(specs(), 'medium'), b = buildTowers(specs(), 'medium');
    meshes(a).forEach((m, i) => {
      expect(Array.from(m.geometry.getAttribute('position').array)).toEqual(Array.from(meshes(b)[i].geometry.getAttribute('position').array));
    });
  });

  it('maps facade UVs in metres: one repeat is 4 floors of 3.2 m', () => {
    const tower: TowerSpec = { x: 0, z: 0, width: 30, depth: 30, height: 100, yaw: 0.4, style: 'glass', seed: 3 };
    const group = buildTowers([tower], 'high');
    const glass = meshes(group).find(m => m.name === 'gold-coast-towers-glass')!;
    const uv = glass.geometry.getAttribute('uv');
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < uv.count; i++) { lo = Math.min(lo, uv.getY(i)); hi = Math.max(hi, uv.getY(i)); }
    expect(hi - lo).toBeCloseTo(100 / (4 * 3.2), 2);
    // Horizontal repeat: a 30 m wall spans 30 / 12 m repeats.
    expect(Math.abs(uv.getX(1) - uv.getX(0))).toBeCloseTo(30 / 12, 5);
    expect(tris(group)).toBeLessThanOrEqual(60);
  });

  it('uses the smaller facade tile on low quality', () => {
    const low = meshes(buildTowers(specs(), 'low'))[0].material as THREE.MeshStandardMaterial;
    const high = meshes(buildTowers(specs(), 'high'))[0].material as THREE.MeshStandardMaterial;
    expect((low.map!.image as HTMLCanvasElement).width).toBe(256);
    expect((high.map!.image as HTMLCanvasElement).width).toBe(512);
    expect(high.map!.colorSpace).toBe(THREE.SRGBColorSpace);
  });

  it('disposes every material, texture and geometry exactly once', () => {
    const group = buildTowers(specs(), 'medium');
    const spies: Array<ReturnType<typeof vi.spyOn>> = [];
    for (const m of meshes(group)) {
      const mat = m.material as THREE.MeshStandardMaterial;
      spies.push(vi.spyOn(mat, 'dispose'), vi.spyOn(m.geometry, 'dispose'));
      if (mat.map) spies.push(vi.spyOn(mat.map, 'dispose'));
    }
    expect(spies.length).toBeGreaterThanOrEqual(10);
    const dispose = group.userData.dispose as () => void;
    dispose(); dispose();
    for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  });
});
