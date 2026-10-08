import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS } from '@/car/liveries';
import { CAR_LOOK, applyCarLook, createCarModel, getCarLook } from '@/car/models';
import type { CarModel } from '@/types/car-model';

const KINDS: CarKind[] = ['camaro', 'mustang', 'supra', 'torana'];
const build = (kind: CarKind, detail: 'high' | 'low' = 'high') => createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail });

function stats(m: CarModel): { triangles: number; drawCalls: number } {
  let triangles = 0;
  let drawCalls = 0;
  m.root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible) return;
    let visible = true;
    o.traverseAncestors((a) => { if (!a.visible) visible = false; });
    if (!visible) return;
    const g = o.geometry;
    const count = g.index ? g.index.count : g.getAttribute('position').count;
    triangles += (count / 3) * (o instanceof THREE.InstancedMesh ? o.count : 1);
    drawCalls += Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;
  });
  return { triangles, drawCalls };
}

function paintPositions(m: CarModel): Float32Array {
  const paint = m.root.getObjectByName('paint') as THREE.Mesh;
  return Float32Array.from(paint.geometry.getAttribute('position').array as Float32Array);
}

describe.each(KINDS)('%s model', (kind) => {
  const d = CAR_SPECS[kind].dimensions;
  const high = build(kind);
  const low = build(kind, 'low');

  it('matches the spec bounding box within 3%', () => {
    high.root.updateMatrixWorld(true);
    // The contact-shadow blob is a ground decal, not part of the car's size.
    const box = new THREE.Box3();
    high.root.traverse((o) => { if (o instanceof THREE.Mesh && !o.userData.contactShadow) box.expandByObject(o); });
    const size = box.getSize(new THREE.Vector3());
    expect(Math.abs(size.z - d.length) / d.length).toBeLessThan(0.03);
    expect(Math.abs(size.x - d.width) / d.width).toBeLessThan(0.03);
    expect(Math.abs(size.y - d.height) / d.height).toBeLessThan(0.03);
  });

  it('places the wheel centres on the wheelbase and tracks (2 cm)', () => {
    const tyre = high.root.getObjectByName('tyre') as THREE.InstancedMesh;
    const expected = [
      [d.trackFront / 2, d.wheelRadius, d.wheelbase / 2],
      [-d.trackFront / 2, d.wheelRadius, d.wheelbase / 2],
      [d.trackRear / 2, d.wheelRadius, -d.wheelbase / 2],
      [-d.trackRear / 2, d.wheelRadius, -d.wheelbase / 2],
    ];
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    expected.forEach((e, i) => {
      tyre.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.distanceTo(new THREE.Vector3(...e))).toBeLessThan(0.02);
    });
  });

  it('keeps triangle and draw-call budgets', () => {
    const h = stats(high);
    const l = stats(low);
    expect(h.triangles).toBeLessThanOrEqual(40000);
    expect(l.triangles).toBeLessThanOrEqual(6000);
    expect(h.drawCalls).toBeLessThanOrEqual(26); // 25 + the contact-shadow plane
    expect(l.drawCalls).toBeLessThanOrEqual(9); // 8 + the contact-shadow plane
    expect(low.root.getObjectByName('interior')).toBeUndefined();
  });

  it('keeps a cheap cabin visible from outside when the cockpit is hidden', () => {
    high.setInteriorVisible(false);
    const tris = (name: string) => {
      const g = high.root.getObjectByName(name);
      let n = 0;
      g?.traverse((o) => {
        if (o instanceof THREE.Mesh) n += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3;
      });
      return n;
    };
    expect(high.root.getObjectByName('cabin')?.visible).toBe(true);
    expect(high.root.getObjectByName('cabin-outside')?.visible).toBe(true);
    expect(high.root.getObjectByName('interior')?.visible).toBe(false);
    expect(tris('cabin') + tris('cabin-outside')).toBeLessThan(3000);
    expect(stats(high).triangles).toBeLessThanOrEqual(40000);
    high.setInteriorVisible(true);
    expect(high.root.getObjectByName('interior')?.visible).toBe(true);
    expect(high.root.getObjectByName('cabin-outside')?.visible).toBe(false);
  });

  it('shows a live rear-view texture in the interior mirror and has a mirrorEye anchor', () => {
    const glass = high.root.getObjectByName('rear-view-mirror') as THREE.Mesh;
    const plain = glass.material as THREE.Material;
    const tex = new THREE.Texture();
    high.setMirrorTexture?.(tex);
    const live = glass.material as THREE.MeshBasicMaterial;
    expect(live.isMeshBasicMaterial).toBe(true);
    expect(live.map).toBe(tex);
    high.setMirrorTexture?.(null);
    expect(glass.material).toBe(plain);
    const eye = high.root.getObjectByName('mirrorEye');
    expect(eye?.parent).toBe(high.body);
    expect(eye?.position.x).toBeCloseTo(0);
  });

  it('dents the body on impact, caps the dent and restores on reset', () => {
    const before = paintPositions(high);
    high.applyImpact({ point: new THREE.Vector3(0.8, 0.45, 2.1), direction: new THREE.Vector3(-0.5, 0, -0.85).normalize(), severity: 0.9 });
    high.applyImpact({ point: new THREE.Vector3(0.8, 0.45, 2.1), direction: new THREE.Vector3(-0.5, 0, -0.85).normalize(), severity: 0.9 });
    const after = paintPositions(high);
    let moved = 0;
    for (let i = 0; i < before.length; i += 3) {
      moved = Math.max(moved, Math.hypot(after[i] - before[i], after[i + 1] - before[i + 1], after[i + 2] - before[i + 2]));
    }
    expect(moved).toBeGreaterThan(0.02);
    // Dent cap plus the tiny crumple noise term.
    expect(moved).toBeLessThan(CAR_LOOK.damage.maxDent + 0.03);
    expect(high.getDamageZones().front).toBeGreaterThan(0.5);
    expect(high.getDamageZones().left).toBeGreaterThan(0.3);
    high.resetDamage();
    const reset = paintPositions(high);
    let diff = 0;
    for (let i = 0; i < before.length; i++) diff = Math.max(diff, Math.abs(reset[i] - before[i]));
    expect(diff).toBeLessThan(1e-6);
    expect(high.getDamageZones()).toEqual({ front: 0, rear: 0, left: 0, right: 0 });
  });

  it('applies body attitude exactly as documented', () => {
    high.setBodyAttitude(0.05, 0.02, 0.03);
    expect(high.body.rotation.x).toBeCloseTo(-0.05);
    expect(high.body.rotation.z).toBeCloseTo(0.02);
    expect(high.body.position.y).toBeCloseTo(0.03);
    high.setBodyAttitude(0, 0, 0);
  });

  it('switches to a single translucent ghost material and back', () => {
    high.setGhost(true);
    const mats = new Set<THREE.Material>();
    high.root.traverse((o) => {
      if (o instanceof THREE.Mesh && !o.userData.contactShadow) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((x) => mats.add(x));
        expect(o.castShadow).toBe(false);
      }
    });
    expect(mats.size).toBe(1);
    const ghost = [...mats][0];
    expect(ghost.transparent).toBe(true);
    // One clean shell: the shell writes depth and draws first; inner parts are hidden.
    expect(ghost.depthWrite).toBe(true);
    expect(high.root.getObjectByName('paint')?.renderOrder).toBeLessThan(0);
    expect(high.root.getObjectByName('disc')?.visible).toBe(false);
    expect(high.root.getObjectByName('interior')?.visible).toBe(false);
    expect(high.root.getObjectByName('contact-shadow')?.visible).toBe(false);
    high.setGhost(false);
    expect(high.root.getObjectByName('contact-shadow')?.visible).toBe(true);
    expect((high.root.getObjectByName('paint') as THREE.Mesh).material).not.toBe(ghost);
    expect(high.root.getObjectByName('disc')?.visible).toBe(true);
    expect(high.root.getObjectByName('paint')?.renderOrder).toBe(0);
  });

  it('retunes live materials through applyCarLook', () => {
    applyCarLook(high, { paint: { roughness: 0.61 }, ghost: { opacity: 0.2 } });
    const paint = (high.root.getObjectByName('paint') as THREE.Mesh).material as THREE.MeshPhysicalMaterial;
    expect(paint.roughness).toBeCloseTo(0.61);
    expect(getCarLook(high)?.ghost.opacity).toBeCloseTo(0.2);
    expect(CAR_LOOK.paint.roughness).not.toBeCloseTo(0.61);
  });
});

describe('cockpit style', () => {
  const names = (m: CarModel) => {
    const out = new Set<string>();
    m.root.traverse((o) => out.add(o.name));
    return out;
  };

  it('gives the torana a classic cockpit: dials, gear lever, steering wheel and no MoTeC display', () => {
    const n = names(build('torana'));
    expect(n.has('motec-display')).toBe(false);
    expect(n.has('classic-dials')).toBe(true);
    expect(n.has('gear-lever')).toBe(true);
    expect(n.has('steering-wheel')).toBe(true);
  });

  it('keeps the MoTeC display and no classic parts on the camaro', () => {
    const n = names(build('camaro'));
    expect(n.has('motec-display')).toBe(true);
    expect(n.has('classic-dials')).toBe(false);
    expect(n.has('gear-lever')).toBe(false);
  });
});

describe('classic dash gauges', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('repaints the dial canvas only when the rpm (50) or speed (1 km/h) shown changes', () => {
    const stroke = vi.fn();
    const canvases: Array<{ width: number; height: number }> = [];
    vi.stubGlobal('document', {
      createElement: () => {
        const canvas = { width: 0, height: 0, getContext: (): unknown => ctx };
        const ctx = new Proxy({ canvas, fillText: vi.fn(), stroke }, {
          get: (t, key) => (key === 'canvas' ? t.canvas : key in t ? Reflect.get(t, key) : () => ({ addColorStop() {} })),
        });
        canvases.push(canvas);
        return canvas;
      },
    });
    const model = build('torana');
    const tex = model.root.getObjectByName('classic-dials') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const map = tex.material.map!;
    expect(canvases.some((c) => c.width === 512 && c.height === 256)).toBe(true);
    const state = { gear: 3, speedKmh: 100, shiftLights: 0, lapS: null, deltaS: null, waterTempC: 90 };
    const strokes = () => stroke.mock.calls.length;
    const built = strokes();
    model.setDash?.(state);
    const first = strokes();
    expect(first).toBeGreaterThan(built);
    model.setDash?.({ ...state, lapS: 12.3 });
    expect(strokes()).toBe(first);
    model.setDash?.({ ...state, speedKmh: 120 });
    expect(strokes()).toBeGreaterThan(first);
    expect(map.version).toBeGreaterThan(0);
    model.dispose();
  });
});
