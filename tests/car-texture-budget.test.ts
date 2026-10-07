import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCarModel } from '@/car/models';
import { LIVERY_PRESETS } from '@/car/liveries';
import type { CarKind } from '@/car/car-specs';
import type { QualityPreset } from '@/render/renderer';

// A CPU-only canvas exercises the real texture allocation and livery painter.
function fakeCanvas() {
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const ctx = new Proxy({ canvas }, {
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
