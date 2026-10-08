// The 1979 #05 Torana's body details (box bonnet hump, upswept spoiler tips, bolt-on flares, amber tail-lamp
// sections, louvre, bonnet pins), its gear lever and HUD outline, and the guarantee that every new body option is
// off for the Gen3 cars. Reference: docs/references/cars-torana.md.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS } from '@/car/liveries';
import { createCarModel } from '@/car/models';
import { CAMARO_PROFILE } from '@/car/models/camaro-profile';
import { MUSTANG_PROFILE } from '@/car/models/mustang-profile';
import { SUPRA_PROFILE } from '@/car/models/supra-profile';
import { TORANA_PROFILE } from '@/car/models/torana-profile';
import { resolveProfile } from '@/car/models/profile-resolve';
import { compileCurves, controlPoints } from '@/car/models/body-section';
import { buildBodyGrid } from '@/car/models/body-grid';
import { poseGearLever } from '@/car/models/interior-classic';
import { DAMAGE_SHAPES, damageShapeFor } from '@/hud/damage';

const build = (kind: CarKind) => createCarModel(kind, { livery: LIVERY_PRESETS[kind][0].livery, detail: 'high' });

describe('new body options stay off for the Gen3 cars', () => {
  it.each([['camaro', CAMARO_PROFILE], ['mustang', MUSTANG_PROFILE], ['supra', SUPRA_PROFILE]] as const)('%s', (kind, p) => {
    expect(p.hump).toBeUndefined();
    expect(p.flares).toBeUndefined();
    expect(p.quarterLouvre).toBeUndefined();
    expect(p.bonnetPins).toBeUndefined();
    expect(p.tail.tipLift).toBeUndefined();
    expect(p.taillight.amber).toBeUndefined();
    expect(p.mirror.colour).toBeUndefined();
    const m = build(kind);
    expect(m.root.getObjectByName('paint-flares')).toBeUndefined();
    expect(m.root.getObjectByName('tail-amber')).toBeUndefined();
    expect(m.root.getObjectByName('gear-lever-pivot')).toBeUndefined();
  });
});

describe('torana body', () => {
  const p = resolveProfile(TORANA_PROFILE, CAR_SPECS.torana.dimensions);
  const cv = compileCurves(p.curves);
  const hump = p.hump!;
  const flat = { inArch: false, lipY: 0 };

  it('has a box bonnet hump: flat top, straight walls, about 8 cm tall and 0.6 m wide', () => {
    const z = hump.scoopZ + 0.25;
    const s = controlPoints(p, cv, z, flat);
    const w = cv.domeW(z);
    expect(s.edgeT).toBeGreaterThan(0);
    expect(2 * w).toBeGreaterThan(0.55);
    expect(2 * w).toBeLessThan(0.65);
    const rise = s.top(0) - s.top(w + 0.02);
    expect(rise).toBeGreaterThan(0.07);
    expect(rise).toBeLessThan(0.1);
    // Flat top up to the wall, then the full rise inside the wall width.
    expect(Math.abs(s.top(0) - s.top(w - hump.edge - 0.005))).toBeLessThan(0.006);
    expect(s.top(w - hump.edge) - s.top(w)).toBeGreaterThan(rise * 0.9);
  });

  it('marks the hump rows for hard creases at its top edge and foot', () => {
    const grid = buildBodyGrid(p, CAR_SPECS.torana.dimensions, { detail: 'high', step: 0.085, archRows: 15, capRows: 9 });
    expect(grid.humpRows).toBeDefined();
    expect(grid.humpRows![1]).toBeGreaterThan(grid.humpRows![0] + 4);
  });

  it('lifts the spoiler tips above the centre lip', () => {
    const m = build('torana');
    const pos = (m.root.getObjectByName('paint') as THREE.Mesh).geometry.getAttribute('position');
    let zMin = Infinity;
    for (let i = 0; i < pos.count; i++) zMin = Math.min(zMin, pos.getZ(i));
    let tip = -Infinity, centre = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getZ(i) > zMin + 0.25) continue;
      const x = Math.abs(pos.getX(i));
      if (x > 0.7) tip = Math.max(tip, pos.getY(i));
      if (x < 0.25) centre = Math.max(centre, pos.getY(i));
    }
    expect(tip - centre).toBeGreaterThan(0.03);
  });

  it('builds flare lips, an amber tail section that ignores the brake lights, and black mirrors', () => {
    const m = build('torana');
    expect(m.root.getObjectByName('paint-flares')).toBeDefined();
    const amber = m.root.getObjectByName('tail-amber') as THREE.Mesh;
    const mat = amber.material as THREE.MeshStandardMaterial;
    const before = mat.emissiveIntensity;
    m.setBrakeLights(true);
    expect(mat.emissiveIntensity).toBe(before);
    expect(mat.color.r).toBeGreaterThan(mat.color.g);
    expect(mat.color.g).toBeGreaterThan(mat.color.b);
    expect(p.mirror.colour).toBe(0x151515);
  });
});

describe('torana gearbox and gear lever', () => {
  it('uses a homologated four-speed set and the 2.60 axle', () => {
    const s = CAR_SPECS.torana;
    expect(s.gearRatios).toEqual([2.43, 1.61, 1.23, 1.0]);
    expect(s.reverseRatio).toBe(2.35);
    expect(s.finalDrive).toBe(2.6);
  });

  it('moves the lever through a four-speed H gate', () => {
    const pose = (g: number) => {
      const o = new THREE.Object3D();
      poseGearLever(o, g, 4);
      return { fore: o.rotation.x, side: o.rotation.z };
    };
    const [n, g1, g2, g3, g4, g5] = [0, 1, 2, 3, 4, 5].map(pose);
    expect(n).toEqual({ fore: 0, side: 0 });
    expect(g1.fore).toBeGreaterThan(0);
    expect(g2.fore).toBeLessThan(0);
    expect(g1.side).toBe(g2.side);
    expect(g3.side).toBe(g4.side);
    expect(g3.side).not.toBe(g1.side);
    expect(g5).toEqual(g4);
  });

  it('poses the lever from the dash state', () => {
    const m = build('torana');
    const lever = m.root.getObjectByName('gear-lever-pivot') as THREE.Object3D;
    m.setDash?.({ gear: 1, speedKmh: 40, shiftLights: 0, lapS: null, deltaS: null, waterTempC: 90 });
    const first = lever.rotation.x;
    m.setDash?.({ gear: 4, speedKmh: 200, shiftLights: 0, lapS: null, deltaS: null, waterTempC: 90 });
    expect(first).toBeGreaterThan(0);
    expect(lever.rotation.x).toBeLessThan(0);
  });
});

describe('HUD damage outline', () => {
  it('draws the Torana with its own outline and the Gen3 cars with the Gen3 one', () => {
    expect(damageShapeFor('torana')).toBe('classic');
    for (const k of ['camaro', 'mustang', 'supra'] as const) expect(damageShapeFor(k)).toBe('gen3');
    expect(damageShapeFor(undefined)).toBe('gen3');
    expect(DAMAGE_SHAPES.classic.body).not.toBe(DAMAGE_SHAPES.gen3.body);
    expect(DAMAGE_SHAPES.classic.aero).toHaveLength(DAMAGE_SHAPES.gen3.aero.length);
  });
});
