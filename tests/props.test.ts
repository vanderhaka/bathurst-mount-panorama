import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { InstancedPropKind } from '@/types/props';
import { clearPropCache, getPropAsset, PROP_VARIANTS, PROPS_LOOK, resetPropsLook, setPropsLook, structures } from '@/props';

// Budgets from docs/ART_DIRECTION.md. Spectators carry a lofted medium-poly
// body (seated ones also their chair/esky), so they get a little more than a sign.
const SMALL = 300;
const LARGE = 800;
const BUDGET: Record<InstancedPropKind, [min: number, max: number]> = {
  eucalyptus: [200, 450],
  eucalyptusYoung: [150, 450],
  pine: [150, 450],
  shrub: [20, SMALL],
  rock: [20, SMALL],
  grassTuft: [10, 80],
  tyreStack: [100, SMALL],
  marshalPost: [50, SMALL],
  lightPole: [30, SMALL],
  flagPole: [20, SMALL],
  trackPole: [20, 120],
  tvCameraTower: [100, LARGE],
  spectator: [150, 350],
  spectatorSeated: [150, 440],
  tent: [40, LARGE],
  gazebo: [40, LARGE],
  caravan: [150, LARGE],
  campervan: [150, LARGE],
  roadCar: [150, LARGE],
  portaloo: [30, SMALL],
  waterTank: [60, LARGE],
  house: [60, LARGE],
  shed: [30, LARGE],
  billboard: [12, SMALL],
  distanceBoard: [20, SMALL],
};
const TREES: InstancedPropKind[] = ['eucalyptus', 'eucalyptusYoung', 'pine'];
const KINDS = Object.keys(BUDGET) as InstancedPropKind[];

function tris(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

describe('instanced props', () => {
  it('declares variants for every kind in the contract', () => {
    for (const k of KINDS) expect(PROP_VARIANTS[k], k).toBeGreaterThanOrEqual(1);
    expect(PROP_VARIANTS.eucalyptus).toBeGreaterThanOrEqual(6);
    expect(PROP_VARIANTS.house).toBeGreaterThanOrEqual(3);
  });

  for (const kind of KINDS) {
    it(`${kind}: every variant builds within budget, coloured, standing on y = 0`, () => {
      for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
        const a = getPropAsset(kind, v);
        const g = a.geometry;
        const label = `${kind}#${v}`;
        expect(g.index, `${label} non-indexed`).toBeNull();
        expect(g.getAttribute('color'), `${label} color`).toBeDefined();
        expect(g.getAttribute('normal'), `${label} normal`).toBeDefined();
        expect(a.triangles, label).toBe(tris(g));
        expect(a.triangles, `${label} tris`).toBeGreaterThanOrEqual(BUDGET[kind][0]);
        expect(a.triangles, `${label} tris`).toBeLessThanOrEqual(BUDGET[kind][1]);
        g.computeBoundingBox();
        const bb = g.boundingBox!;
        expect(bb.min.y, `${label} min y`).toBeGreaterThan(-0.08);
        expect(bb.min.y, `${label} min y`).toBeLessThan(0.08);
        expect(a.height, label).toBeGreaterThan(0);
        expect(a.radius, label).toBeGreaterThan(0);
        // Colours are finite, linear and not all black.
        const col = g.getAttribute('color').array as Float32Array;
        expect(col.every((c) => Number.isFinite(c) && c >= 0 && c <= 1.5), `${label} colour range`).toBe(true);
        if (a.tintable) expect(g.getAttribute('tintMask'), `${label} tintMask`).toBeDefined();
        // Same kind + variant returns the cached asset; material is white-based.
        expect(getPropAsset(kind, v)).toBe(a);
        expect((a.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
      }
    });
  }

  it('trees have a far LOD of at most 60 triangles and real-world heights', () => {
    for (const kind of TREES) {
      for (let v = 0; v < PROP_VARIANTS[kind]; v++) {
        const a = getPropAsset(kind, v);
        expect(a.lodGeometry, `${kind}#${v} lod`).toBeDefined();
        expect(tris(a.lodGeometry!), `${kind}#${v} lod tris`).toBeLessThanOrEqual(60);
        expect(a.lodGeometry!.getAttribute('color')).toBeDefined();
      }
    }
    for (let v = 0; v < PROP_VARIANTS.eucalyptus; v++) {
      const h = getPropAsset('eucalyptus', v).height;
      expect(h).toBeGreaterThanOrEqual(11);
      expect(h).toBeLessThanOrEqual(27);
    }
    for (let v = 0; v < PROP_VARIANTS.eucalyptusYoung; v++) {
      const h = getPropAsset('eucalyptusYoung', v).height;
      expect(h).toBeGreaterThanOrEqual(3.5);
      expect(h).toBeLessThanOrEqual(9);
    }
  });

  it('gum trees: open, spreading crowns and a leaf-only tint material', () => {
    // The paddock gum (variant 0) is wider than it is tall above the ground; the stag is the smallest crown.
    const paddock = getPropAsset('eucalyptus', 0);
    expect(paddock.radius * 2).toBeGreaterThan(paddock.height * 0.7);
    // Gums share their own material (trunks take only the brightness of the instance colour).
    const m = paddock.material as THREE.MeshStandardMaterial;
    expect(m.name).toBe('props-tree');
    expect(getPropAsset('eucalyptusYoung', 0).material).toBe(m);
    const shader = { vertexShader: '#include <color_pars_vertex>\nvoid main() {\n#include <color_vertex>\n}', fragmentShader: '', uniforms: {} };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(shader.vertexShader).not.toContain('#include <color_vertex>');
    expect(shader.vertexShader.match(/propsLeafTint\(/g)?.length).toBe(3);
  });

  it('faces point outwards (positive signed volume) for solid props', () => {
    for (const kind of ['tyreStack', 'rock', 'portaloo', 'waterTank', 'house', 'caravan', 'roadCar', 'eucalyptus', 'pine'] as InstancedPropKind[]) {
      const g = getPropAsset(kind, 0).geometry;
      const p = g.getAttribute('position');
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      let vol = 0;
      for (let i = 0; i < p.count; i += 3) {
        a.fromBufferAttribute(p, i);
        b.fromBufferAttribute(p, i + 1);
        c.fromBufferAttribute(p, i + 2);
        vol += a.dot(b.clone().cross(c)) / 6;
      }
      expect(vol, kind).toBeGreaterThan(0);
    }
  });

  it('wraps variant indices and rejects unknown kinds', () => {
    expect(getPropAsset('tent', PROP_VARIANTS.tent)).toBe(getPropAsset('tent', 0));
    expect(getPropAsset('tent', -1)).toBe(getPropAsset('tent', PROP_VARIANTS.tent - 1));
    expect(() => getPropAsset('nope' as InstancedPropKind)).toThrow();
  });

  it('setPropsLook changes the look and rebuilds assets', () => {
    const before = getPropAsset('eucalyptus', 0);
    setPropsLook({ eucalyptus: { foliage: [0xff0000] } });
    expect(PROPS_LOOK.eucalyptus.foliage).toEqual([0xff0000]);
    const after = getPropAsset('eucalyptus', 0);
    expect(after).not.toBe(before);
    setPropsLook({ shading: { flat: false } });
    const smooth = getPropAsset('eucalyptus', 0);
    expect((smooth.material as THREE.MeshStandardMaterial).flatShading).toBe(false);
    expect(smooth.triangles).toBe(after.triangles);
    resetPropsLook();
    expect(PROPS_LOOK.eucalyptus.foliage.length).toBeGreaterThan(1);
    expect((getPropAsset('eucalyptus', 0).material as THREE.MeshStandardMaterial).flatShading).toBe(true);
    clearPropCache();
    expect(getPropAsset('eucalyptus', 0)).not.toBe(after);
  });
});

describe('structures', () => {
  const count = (g: THREE.Group) => {
    let meshes = 0;
    let triangles = 0;
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        meshes++;
        triangles += tris(o.geometry as THREE.BufferGeometry);
      }
    });
    return { meshes, triangles };
  };
  const cases: Array<[string, () => THREE.Group, number]> = [
    ['pitBuilding', () => structures.pitBuilding({ length: 200, garages: 20 }), 15000],
    ['controlTower', () => structures.controlTower({ height: 18 }), 15000],
    ['grandstand', () => structures.grandstand({ length: 50, rows: 14, roof: true, crowd: 0 }), 15000],
    ['grandstand+crowd', () => structures.grandstand({ length: 50, rows: 14, roof: true, crowd: 0.7 }), 40000],
    ['startGantry', () => structures.startGantry({ span: 18, height: 6.5 }), 15000],
    ['footBridge', () => structures.footBridge({ span: 22, clearance: 5.5 }), 15000],
    ['videoScreen', () => structures.videoScreen({ width: 10 }), 15000],
    ['building:amenities', () => structures.building({ width: 12, depth: 8, height: 3.5, style: 'amenities' }), 15000],
    ['building:museum', () => structures.building({ width: 30, depth: 16, height: 6, style: 'museum' }), 15000],
    ['building:corporate', () => structures.building({ width: 20, depth: 10, height: 7, style: 'corporate' }), 15000],
    ['building:shed', () => structures.building({ width: 16, depth: 10, height: 5, style: 'shed' }), 15000],
    ['hillsideLetters', () => structures.hillsideLetters({ text: 'MOUNT PANORAMA', letterHeight: 6 }), 15000],
  ];
  for (const [name, make, maxTris] of cases) {
    it(`${name} builds with < 12 draw calls and within budget`, () => {
      const g = make();
      const { meshes, triangles } = count(g);
      expect(meshes, name).toBeGreaterThan(0);
      expect(meshes, name).toBeLessThan(12);
      expect(triangles, name).toBeGreaterThan(20);
      expect(triangles, name).toBeLessThanOrEqual(maxTris);
      const bb = new THREE.Box3().setFromObject(g);
      expect(bb.min.y, `${name} min y`).toBeGreaterThan(-0.6);
    });
  }

  it('scales with its parameters', () => {
    const size = (g: THREE.Group) => new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
    expect(size(structures.pitBuilding({ length: 300, garages: 30 })).x).toBeGreaterThan(size(structures.pitBuilding({ length: 120, garages: 12 })).x + 150);
    expect(size(structures.controlTower({ height: 24 })).y).toBeGreaterThan(22);
    expect(size(structures.footBridge({ span: 30, clearance: 5.5 })).x).toBeGreaterThan(30);
    expect(size(structures.hillsideLetters({ text: 'AB', letterHeight: 10 })).y).toBeGreaterThan(9);
  });
});
