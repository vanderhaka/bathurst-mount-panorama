import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { LIVERY_PRESETS } from '@/car/liveries';
import { createCarModel } from '@/car/models';
import type { CarModel } from '@/types/car-model';

// A 1970s-style Camaro: no wing, splitter, skirts, diffuser or dive planes, and 15 inch classic wheels.
vi.mock('@/car/models/camaro-profile', async (orig) => {
  const real = await orig<typeof import('@/car/models/camaro-profile')>();
  const { wing: _wing, splitter: _splitter, ...rest } = real.CAMARO_PROFILE;
  return {
    ...real,
    CAMARO_PROFILE: { ...rest, sideSkirts: false, diffuser: false, canards: [], wheel: { kind: 'classic', rimRadius: 0.1905, rimHalfWidth: 0.127, discRadius: 0.138 } },
  };
});

// Visible triangles of the unmodified Gen3 Camaro, measured with the real profile
// (the mock above replaces it for this whole file, so it cannot be built here).
// Re-measured after the rolled-crease fillet columns and the bonnet bulge (car-body AAA pass).
const GEN3_TRIANGLES = { high: 35210, low: 4936 };

const build = (detail: 'high' | 'low'): CarModel => createCarModel('camaro', { livery: LIVERY_PRESETS.camaro[0].livery, detail });

function triangles(m: CarModel): number {
  let total = 0;
  m.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    const g = o.geometry;
    const count = g.index ? g.index.count : g.getAttribute('position').count;
    total += (count / 3) * (o instanceof THREE.InstancedMesh ? o.count : 1);
  });
  return total;
}

function maxAxleDistance(mesh: THREE.Mesh): number {
  const p = mesh.geometry.getAttribute('position');
  let out = 0;
  for (let i = 0; i < p.count; i++) out = Math.max(out, Math.hypot(p.getY(i), p.getZ(i)));
  return out;
}

describe.each(['high', 'low'] as const)('classic camaro at %s detail', (detail) => {
  const model = build(detail);

  it('has no wing, wing endplates or splitter', () => {
    for (const name of ['wing', 'wing-endplates', 'splitter']) expect(model.root.getObjectByName(name)).toBeUndefined();
  });

  it('survives full-severity damage and reset', () => {
    const hit = (point: THREE.Vector3, direction: THREE.Vector3) => model.applyImpact({ point, direction: direction.normalize(), severity: 1 });
    expect(() => {
      hit(new THREE.Vector3(0.6, 0.45, 2.2), new THREE.Vector3(-0.3, 0, -1));
      hit(new THREE.Vector3(0.6, 0.6, -2.3), new THREE.Vector3(-0.3, 0, 1));
      hit(new THREE.Vector3(0.95, 0.5, 0), new THREE.Vector3(-1, 0, 0));
      model.resetDamage();
    }).not.toThrow();
  });

  it('draws fewer triangles than the Gen3 Camaro', () => {
    expect(triangles(model)).toBeLessThan(GEN3_TRIANGLES[detail]);
  });
});

describe('classic camaro wheels', () => {
  const model = build('high');

  it('keeps every rim vertex within the 15 inch radius plus 2 cm', () => {
    const rim = model.root.getObjectByName('rim') as THREE.Mesh;
    expect(maxAxleDistance(rim)).toBeLessThanOrEqual(0.1905 + 0.02);
  });

  it('keeps the tyre outer radius on the spec wheel radius (1 mm)', () => {
    const tyre = model.root.getObjectByName('tyre') as THREE.Mesh;
    expect(Math.abs(maxAxleDistance(tyre) - CAR_SPECS.camaro.dimensions.wheelRadius)).toBeLessThan(0.001);
  });
});
