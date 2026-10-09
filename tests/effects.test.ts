import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EffectEmission, type EffectSignals } from '@/fx/effect-emission';
import { floorContact, floorProbes } from '@/fx/floor-contact';
import { CarEffects } from '@/fx/car-effects';
import { Particles } from '@/fx/particles';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { createCarModel } from '@/car/models';
import { LIVERY_PRESETS } from '@/car/liveries';
import { Track } from '@/track/track-model';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { heightAt, projectToTrack, createTrackPoint } from '@/track/track-query';

const signals = (overrides: Partial<EffectSignals> = {}): EffectSignals => ({
  gear: 6, rpm: 6500, redline: 7400, throttle: 0.9, speed: 80, s: 4850,
  airborne: false, floorClearance: 0.07,
  wheels: Array.from({ length: 4 }, () => ({ load: 3000, slip: 0.8, surface: 'road' as const })),
  ...overrides,
});

const wheelCount = (planner: EffectEmission, s: EffectSignals, steps: number) => {
  let count = 0;
  for (let i = 0; i < steps; i++) count += planner.step(s, 1 / steps).wheels.reduce((sum, w) => sum + w.count, 0);
  return count;
};

describe('effect emission from real signals', () => {
  it('bursts on hot overrun and positive downshifts, with a refractory interval', () => {
    const planner = new EffectEmission();
    expect(planner.step(signals(), 1 / 60).flame).toBe(0);
    const lift = planner.step(signals({ throttle: 0 }), 1 / 60);
    expect(lift.flame).toBeGreaterThan(0); expect(lift.reason).toBe('overrun');
    for (let i = 0; i < 30; i++) planner.step(signals({ throttle: 0 }), 1 / 60);
    expect(planner.step(signals({ throttle: 0 }), 1 / 60).flame).toBe(0);
    expect(planner.step(signals({ gear: 5, throttle: 0 }), 1 / 60).reason).toBe('downshift');
    for (let i = 0; i < 30; i++) planner.step(signals({ gear: 5, throttle: 0 }), 1 / 60);
    expect(planner.snapshot().bursts).toEqual({ overrun: 1, downshift: 1 });
  });

  it('applies live intensity and cancels an active pulse at zero', () => {
    const planner = new EffectEmission({ intensity: 0.5 });
    planner.step(signals(), 1 / 60);
    const plan = planner.step(signals({ throttle: 0 }), 1 / 60);
    expect(plan.intensity).toBe(0.5); expect(plan.flame).toBeGreaterThan(0);
    planner.configure({ intensity: 0 });
    expect(planner.step(signals({ throttle: 0 }), 1 / 60).flame).toBe(0);
  });

  it('rejects cold engines, upshifts, neutral/reverse and pause/reset discontinuities', () => {
    for (const second of [signals({ rpm: 1400, throttle: 0 }), signals({ gear: 6 }), signals({ gear: -1 }), signals({ gear: 0 })]) {
      const planner = new EffectEmission();
      planner.step(signals({ gear: 5 }), 1 / 60);
      expect(planner.step(second, 1 / 60).flame).toBe(0);
    }
    const planner = new EffectEmission();
    planner.step(signals(), 1 / 60);
    expect(planner.step(signals({ gear: 5 }), 0).flame).toBe(0);
    planner.reset(); expect(planner.step(signals({ gear: 4, throttle: 0 }), 1 / 60).flame).toBe(0);
  });

  it('uses wheel contact/slip and surface for smoke, dust and stones at frame-independent rates', () => {
    const slide = signals({ speed: 20, wheels: [{ load: 4000, slip: 2, surface: 'road' }, { load: 0, slip: 3, surface: 'road' }, { load: 4000, slip: 2, surface: 'grass' }, { load: 4000, slip: 2, surface: 'gravel' }] });
    expect(wheelCount(new EffectEmission(), slide, 60)).toBe(wheelCount(new EffectEmission(), slide, 30));
    const planner = new EffectEmission();
    const plan = planner.step(slide, 0.1);
    expect(plan.wheels.some((e) => e.wheel === 1)).toBe(false);
    expect(plan.wheels.some((e) => e.wheel === 0 && e.kind === 'smoke')).toBe(true);
    expect(plan.wheels.some((e) => e.wheel === 2 && e.kind === 'dust')).toBe(true);
    expect(plan.wheels.some((e) => e.wheel === 3 && e.kind === 'gravel')).toBe(true);
    expect(planner.step({ ...slide, airborne: true }, 0.1).wheels).toEqual([]);
    planner.configure({ smoke: false, dust: false, flames: false, sparks: false });
    expect(planner.step(slide, 0.1).wheels).toEqual([]);
  });

  it('sparks only at Conrod humps with real floor contact, forward full speed and road contact', () => {
    const planner = new EffectEmission();
    expect(planner.step(signals({ floorClearance: -0.005 }), 0.05).sparks).toBeGreaterThan(0);
    for (const invalid of [signals(), signals({ s: 3000, floorClearance: -0.02 }), signals({ speed: 40, floorClearance: -0.02 }), signals({ speed: -80, floorClearance: -0.02 }), signals({ throttle: 0, floorClearance: -0.02 }), signals({ airborne: true, floorClearance: -0.02 }), signals({ floorClearance: NaN })]) {
      expect(new EffectEmission().step(invalid, 0.05).sparks).toBe(0);
    }
    expect(new EffectEmission().step(signals({ s: 5247, floorClearance: 0 }), 0.05).sparks).toBeGreaterThan(0);
    expect(planner.step(signals({ floorClearance: -0.02 }), 0).sparks).toBe(0);
  });
});

it('samples the pitched/rolled undertray against the same track surface as physics', () => {
  const track = new Track();
  const kerbs = placeKerbs(track, computeRacingLine(track));
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.reset(4850, 0);
  const resting = floorContact(v);
  expect(resting.clearance).toBeGreaterThan(0.04);
  v.y -= 0.09;
  const contact = floorContact(v);
  expect(contact.clearance).toBeLessThan(0);
  const tp = projectToTrack(track, contact.x, contact.z, v.tp.index, createTrackPoint());
  expect(contact.y).toBeCloseTo(heightAt(track, tp.index, tp.t, tp.d) + 0.006, 4);
  v.roll = 0.1;
  expect(floorContact(v).clearance).toBeLessThan(contact.clearance - 0.02);
});

it('uses bounded probes on the actual splitter/floor vertices and their current transforms', () => {
  const track = new Track(), v = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, computeRacingLine(track)));
  v.reset(4850, 0);
  const model = createCarModel('camaro', { livery: LIVERY_PRESETS.camaro[0].livery, detail: 'high' });
  const mid = v.spec.dimensions.wheelbase * (0.5 - v.spec.frontWeight);
  model.root.rotation.set(-v.pitch, v.heading, v.roll, 'YXZ');
  model.root.position.set(v.x, v.y - v.spec.cgHeight, v.z).add(new THREE.Vector3(0, 0, mid).applyQuaternion(model.root.quaternion));
  model.root.updateMatrixWorld(true);
  const probes = floorProbes(model.root);
  expect(probes.length).toBeGreaterThan(5); expect(probes.length).toBeLessThanOrEqual(42);
  expect(probes.some((p) => p.mesh.name === 'splitter' && p.mesh.geometry.getAttribute('position').getY(p.index) < 0.064)).toBe(true);
  const contact = floorContact(v, undefined, model.root), expected = { clearance: Infinity, x: 0, z: 0 };
  const p = new THREE.Vector3(), tp = createTrackPoint();
  for (const probe of probes) {
    p.fromBufferAttribute(probe.mesh.geometry.getAttribute('position'), probe.index).applyMatrix4(probe.mesh.matrixWorld);
    projectToTrack(track, p.x, p.z, v.tp.index, tp);
    const clearance = p.y - heightAt(track, tp.index, tp.t, tp.d);
    if (clearance < expected.clearance) Object.assign(expected, { clearance, x: p.x, z: p.z });
  }
  expect(contact.clearance).toBeCloseTo(expected.clearance, 8); expect(contact.x).toBeCloseTo(expected.x, 8);
  model.body.position.y -= 0.02; model.root.updateMatrixWorld(true);
  expect(floorContact(v, undefined, model.root).clearance).toBeCloseTo(contact.clearance - 0.02, 5);
  expect(floorProbes(model.root)).toBe(probes); model.dispose();
});

it('emits flames from model exhaust anchors along their real flow, with isolated car state', () => {
  const track = new Track(), v = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, computeRacingLine(track)));
  v.reset(4850, 0); v.pt.gear = 6; v.pt.rpm = 6500; v.telemetry.throttle = 0.9; v.vx = Math.sin(v.heading) * 80; v.vz = Math.cos(v.heading) * 80;
  const root = new THREE.Group(), anchor = new THREE.Object3D(); root.add(anchor);
  root.position.set(10, 5, 30); anchor.position.set(0.95, 0.108, 0.8); anchor.rotation.y = Math.PI / 2;
  const particles = new Particles(new THREE.Scene(), { seed: 9 }), effects = new CarEffects();
  const car = { vehicle: v, model: { root, exhausts: [anchor] } };
  effects.step(car, particles, 1 / 60); v.telemetry.throttle = 0;
  effects.step(car, particles, 1 / 60);
  const flame = particles.snapshot().particles.find((p) => p.kind === 'flame')!;
  expect(flame).toBeDefined(); expect(flame.x).toBeCloseTo(10.95); expect(flame.y).toBeCloseTo(5.108); expect(flame.z).toBeCloseTo(30.8);
  expect(flame.dx).toBeCloseTo(1); expect(flame.dz).toBeCloseTo(0);
  expect(new CarEffects().snapshot().bursts.downshift).toBe(0);
  effects.reset(); particles.reset(); particles.dispose();
});
