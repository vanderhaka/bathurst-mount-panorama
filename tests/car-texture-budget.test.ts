import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCarModel } from '@/car/models';
import { LIVERY_PRESETS } from '@/car/liveries';
import type { CarKind } from '@/car/car-specs';
import type { QualityPreset } from '@/render/renderer';

// A CPU-only canvas exercises the real texture allocation and livery painter.
function fakeCanvas() {
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const ctx = new Proxy({ canvas, fillText: vi.fn() }, {
    get(target, key) {
      if (key === 'canvas') return target.canvas;
      if (key === 'measureText') return (text: string) => ({ width: text.length * 8 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
      return key in target ? Reflect.get(target, key) : () => {};
    },
  });
  return canvas;
}

afterEach(() => vi.unstubAllGlobals());

describe.each(['camaro', 'mustang', 'supra'] as CarKind[])('%s resident livery atlas', (kind) => {
  it.each([['low', 512, 320], ['medium', 1024, 640], ['high', 2048, 1280]] as const)(
    'uses the %s cap on the actual player texture without reducing geometry', (quality, width, height) => {
      vi.stubGlobal('document', { createElement: fakeCanvas });
      const model = createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail: 'high', quality });
      const paint = model.root.getObjectByName('paint') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
      const image = paint.material.map!.image as HTMLCanvasElement;
      expect([image.width, image.height]).toEqual([width, height]);
      const baseline = createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail: 'high' });
      const baselinePaint = baseline.root.getObjectByName('paint') as THREE.Mesh;
      expect(paint.geometry.getAttribute('position').array).toEqual(baselinePaint.geometry.getAttribute('position').array);
      model.dispose(); baseline.dispose();
    },
  );

  it('also caps the low-detail ghost on Low instead of allocating the geometry preset atlas', () => {
    vi.stubGlobal('document', { createElement: fakeCanvas });
    const quality: QualityPreset = 'low';
    const model = createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail: 'low', quality });
    const paint = model.root.getObjectByName('paint') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
    expect((paint.material.map!.image as HTMLCanvasElement).width).toBe(512);
    model.dispose();
  });
});

describe.each(['camaro', 'mustang', 'supra'] as CarKind[])('%s live tier change', (kind) => {
  it('resizes the resident maps, evicts their old GPU storage and keeps geometry and damage', () => {
    vi.stubGlobal('document', { createElement: fakeCanvas });
    const model = createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, quality: 'high' });
    model.applyImpact({ point: new THREE.Vector3(0.7, 0.5, 0), direction: new THREE.Vector3(-1, 0, 0), severity: 0.4 });
    const paint = model.root.getObjectByName('paint') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
    const map = paint.material.map!;
    const image = map.image as HTMLCanvasElement;
    const positions = Array.from(paint.geometry.getAttribute('position').array);
    const damage = model.getDamageZones();
    const dispose = vi.spyOn(map, 'dispose');
    const lettering = vi.mocked(image.getContext('2d')!.fillText);
    lettering.mockClear();
    model.setQuality('low');
    expect([image.width, image.height]).toEqual([512, 320]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(paint.material.map).toBe(map);
    expect(Array.from(paint.geometry.getAttribute('position').array)).toEqual(positions);
    expect(model.getDamageZones()).toEqual(damage);
    expect(lettering).toHaveBeenCalled();
    lettering.mockClear();
    model.setQuality('medium');
    expect([image.width, image.height]).toEqual([1024, 640]);
    expect(lettering).toHaveBeenCalled();
    model.dispose();
  });

  it('also rebuilds the existing low-detail ghost maps without changing its ghost state', () => {
    vi.stubGlobal('document', { createElement: fakeCanvas });
    const model = createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail: 'low', quality: 'high' });
    model.setGhost(true);
    model.setQuality('low');
    model.setGhost(false);
    const paint = model.root.getObjectByName('paint') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
    expect((paint.material.map!.image as HTMLCanvasElement).width).toBe(512);
    model.dispose();
  });
});
