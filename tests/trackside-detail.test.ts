import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import { createCatchFenceMaterial, fenceWireCoverage, createFenceWireData, wallWeatherMultiplier, weatherTracksideMaterial } from '@/world/trackside-materials';
import { buildFenceHardware, fenceHardwareLayout, FENCE_HARDWARE_PRESETS } from '@/world/fence-hardware';

describe('trackside surface detail', () => {
  it('weathering preserves the palette and scuffs only the named impact neighbourhood', () => {
    const scuffs = [{ x: 4, y: 0.5, z: 8, radius: 2 }];
    const clean = wallWeatherMultiplier(4, 0.5, 8, 0.3, 0, scuffs);
    expect(clean).toBe(1);
    const impact = wallWeatherMultiplier(4, 0.5, 8, 0.3, 0.6, scuffs);
    const ordinary = wallWeatherMultiplier(4, 0.5, 8, 0.3, 0.6, []);
    expect(impact).toBeLessThan(ordinary);
    expect(wallWeatherMultiplier(40, 0.5, 8, 0.3, 0.6, scuffs)).toBe(wallWeatherMultiplier(40, 0.5, 8, 0.3, 0.6, []));
    expect(wallWeatherMultiplier(4, 2, 8, 0.3, 0.6, scuffs)).toBeCloseTo(wallWeatherMultiplier(4, 2, 8, 0.3, 0.6, []), 5);
    for (let x = -10; x < 10; x++) {
      expect(wallWeatherMultiplier(x, 0.5, 1, 0.9, 1, [])).toBeGreaterThan(0.7);
    }
  });

  it('composes shader hooks and shares the fictional atlas without taking its ownership', () => {
    const map = new THREE.Texture();
    const base = new THREE.MeshStandardMaterial({ color: 0xffffff, map });
    let prior = 0, mapDisposed = 0;
    base.onBeforeCompile = () => prior++;
    map.addEventListener('dispose', () => mapDisposed++);
    const detail = weatherTracksideMaterial(base, { amount: 0.4, panels: true, scuffs: [] });
    expect(detail.material).not.toBe(base);
    expect(detail.material.map).toBe(map);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as THREE.WebGLProgramParametersWithUniforms;
    detail.material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(prior).toBe(1);
    expect(shader.fragmentShader).toContain('uWallScuffs');
    detail.setAmount(0.7);
    expect(shader.uniforms.uWallWeather.value).toBe(0.7);
    detail.dispose();
    expect(mapDisposed).toBe(0);
    map.dispose(); base.dispose();
  });

  it('uses physical wire dimensions and whole repeat periods', () => {
    const options = { tileMetres: 0.5, diamondMetres: 0.0625, wireMetres: 0.0025 };
    expect(fenceWireCoverage(0, 0, options)).toBe(1);
    expect(fenceWireCoverage(1 / 32, 0, options)).toBe(0);
    for (const u of [-0.12, 0.05, 0.78]) {
      expect(fenceWireCoverage(u, 0.23, options)).toBe(fenceWireCoverage(u + 1, 1.23, options));
    }
    const data = createFenceWireData(128, options);
    expect(data).toEqual(createFenceWireData(128, options));
    let mean = 0;
    for (let i = 0; i < data.length; i += 4) mean += data[i + 1] / 255;
    expect(mean / (128 * 128)).toBeGreaterThan(0.05);
    expect(mean / (128 * 128)).toBeLessThan(0.25);
    expect(() => createFenceWireData(2048, options)).toThrow();
  });

  it('samples wire coverage once and uses mipmaps and MSAA when available', () => {
    const detail = createCatchFenceMaterial({ size: 128, tileMetres: 0.5, diamondMetres: 0.0625, wireMetres: 0.0025, msaa: true });
    expect(detail.material.map).toBeNull();
    expect(detail.material.alphaMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(detail.material.alphaMap?.generateMipmaps).toBe(true);
    expect(detail.material.alphaMap?.wrapS).toBe(THREE.RepeatWrapping);
    expect(detail.material.alphaToCoverage).toBe(true);
    expect(detail.material.transparent).toBe(false);
    let disposed = 0;
    detail.material.alphaMap?.addEventListener('dispose', () => disposed++);
    detail.dispose(); detail.dispose();
    expect(disposed).toBe(1);
  });
});

describe('fence hardware', () => {
  const track = new Track();
  it('adds caps at existing four metre posts and braces behind the fence', () => {
    const layout = fenceHardwareLayout(track, FENCE_HARDWARE_PRESETS.high);
    expect(layout.caps.length).toBeGreaterThan(100);
    expect(layout.caps.length).toBeLessThanOrEqual(4000);
    expect(layout.stays.length).toBeGreaterThan(0);
    const point: [number, number, number] = [0, 0, 0];
    for (const cap of layout.caps) {
      const side = cap.side >= 0 ? track.left : track.right;
      expect(side.fence[cap.sample]).toBe(1);
      expect(cap.s % 4).toBe(0);
      pointAt(track, cap.s, 0, point);
      expect(Math.hypot(cap.x - point[0], cap.z - point[2])).toBeGreaterThan(side.wall[cap.sample]);
    }
    for (const brace of layout.stays) {
      expect(Math.hypot(brace.a.x - brace.b.x, brace.a.z - brace.b.z)).toBeGreaterThan(1);
    }
  });

  it('does not bridge un-fenced gaps or a large wall-offset discontinuity', () => {
    const layout = fenceHardwareLayout(track, FENCE_HARDWARE_PRESETS.high);
    for (const cable of layout.cables) expect(cable.a.distanceTo(cable.b)).toBeLessThan(5.5);
    expect(fenceHardwareLayout(track, FENCE_HARDWARE_PRESETS.low).caps).toHaveLength(0);
  });

  it('instances small primitives in at most three draws and releases ownership', () => {
    const hardware = buildFenceHardware(track, { ...FENCE_HARDWARE_PRESETS.high, maxPosts: 30 });
    expect(hardware.group.children.length).toBeLessThanOrEqual(3);
    let disposed = 0;
    for (const child of hardware.group.children) {
      expect(child).toBeInstanceOf(THREE.InstancedMesh);
      const mesh = child as THREE.InstancedMesh;
      expect((mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3).toBeLessThanOrEqual(300);
      mesh.geometry.addEventListener('dispose', () => disposed++);
    }
    const expected = hardware.group.children.length;
    hardware.dispose(); hardware.dispose();
    expect(disposed).toBe(expected);
  });
});
