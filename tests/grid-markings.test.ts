import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession } from '@/game/race-session';
import { Vehicle } from '@/physics/vehicle';
import { GRID_SLOTS, gridSlot } from '@/race/grid';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import { buildStartMarkings } from '@/world/road';

interface Bar { s0: number; s1: number; d0: number; d1: number }

/** Painted grid bars read back from the start-marking mesh (vertices 0-3 are the timing stripe). */
function paintedBars(track: Track): Bar[] {
  const material = new THREE.MeshBasicMaterial();
  const mesh = buildStartMarkings(track, material).children[0] as THREE.Mesh;
  const pos = mesh.geometry.getAttribute('position'), tp = createTrackPoint(), bars: Bar[] = [];
  expect(pos.count).toBe(4 * (1 + GRID_SLOTS));
  for (let b = 1; b <= GRID_SLOTS; b++) {
    const bar: Bar = { s0: Infinity, s1: -Infinity, d0: Infinity, d1: -Infinity };
    for (let v = 4 * b; v < 4 * b + 4; v++) {
      projectToTrack(track, pos.getX(v), pos.getZ(v), -1, tp);
      bar.s0 = Math.min(bar.s0, tp.s); bar.s1 = Math.max(bar.s1, tp.s);
      bar.d0 = Math.min(bar.d0, tp.d); bar.d1 = Math.max(bar.d1, tp.d);
    }
    bars.push(bar);
  }
  mesh.geometry.dispose(); material.dispose();
  return bars;
}

describe.each([['Bathurst', new Track()], ['Adelaide', createAdelaideTrack()]] as const)('%s grid boxes', (_name, track) => {
  const line = computeRacingLine(track), kerbs = placeKerbs(track, line), bars = paintedBars(track);
  const vehicle = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  const dim = vehicle.spec.dimensions;
  /** The vehicle origin is the CG: the front axle is 47 % of the wheelbase ahead of it. */
  const noseM = dim.wheelbase * (1 - vehicle.spec.frontWeight) + dim.frontOverhang;

  /** The pole car is placed by the race session itself, so this is where it really stands. */
  function poleCar(): CarEntity {
    const car = {
      vehicle, livery: { number: 6, primary: 0xff0000 }, model: { root: new THREE.Object3D(), dispose() {} },
      sync() {}, repair: () => vehicle.repair(), reset: (s: number, d: number) => vehicle.reset(s, d),
    } as unknown as CarEntity;
    new RaceSession('camaro', track, line, car).placeOnGrid();
    return car;
  }

  function expectBoxAround(slot: number): void {
    const bar = bars[slot], car = { s: vehicle.tp.s, d: vehicle.tp.d };
    const gap = bar.s0 - (car.s + noseM);
    expect(gap, `slot ${slot + 1}: bar ahead of the nose`).toBeGreaterThan(0.2);
    expect(gap, `slot ${slot + 1}: bar close to the nose`).toBeLessThan(1.5);
    expect(bar.s1 - bar.s0, 'bar length').toBeLessThan(0.5);
    expect(Math.sign((bar.d0 + bar.d1) / 2), `slot ${slot + 1}: same side as the car`).toBe(Math.sign(car.d));
    expect(bar.d0, `slot ${slot + 1}: covers the car's left edge`).toBeLessThanOrEqual(car.d - dim.width / 2);
    expect(bar.d1, `slot ${slot + 1}: covers the car's right edge`).toBeGreaterThanOrEqual(car.d + dim.width / 2);
  }

  it('paints the pole box just ahead of where the race session places the car, on its side', () => {
    poleCar();
    expectBoxAround(0);
    expect(vehicle.tp.d).toBeLessThan(0);
  });

  it('paints every one of the 12 boxes around its slot, alternating sides every 8 m', () => {
    for (let k = 0; k < GRID_SLOTS; k++) {
      const slot = gridSlot(track, k);
      vehicle.reset(slot.s, slot.d);
      expectBoxAround(k);
      expect(Math.sign(vehicle.tp.d)).toBe(k % 2 === 0 ? -1 : 1);
      if (k > 0) expect(bars[k - 1].s0 - bars[k].s0).toBeCloseTo(8, 0);
    }
  });

  it('paints the bars facing up, so they are not culled, and just above the road', () => {
    const material = new THREE.MeshBasicMaterial();
    const geo = (buildStartMarkings(track, material).children[0] as THREE.Mesh).geometry;
    const normal = geo.getAttribute('normal'), pos = geo.getAttribute('position');
    for (let v = 0; v < pos.count; v++) expect(normal.getY(v), `vertex ${v}`).toBeGreaterThan(0.9);
    const tp = createTrackPoint();
    for (let v = 4; v < pos.count; v++) {
      projectToTrack(track, pos.getX(v), pos.getZ(v), -1, tp);
      const road = pointAt(track, tp.s, tp.d, [0, 0, 0])[1];
      expect(pos.getY(v) - road, `vertex ${v}`).toBeCloseTo(0.007, 2);
    }
    geo.dispose(); material.dispose();
  });

  it('keeps the boxes behind the standing-start line and on the asphalt', () => {
    for (const bar of bars) {
      expect(bar.s1).toBeLessThan(track.gridLineS);
      for (const d of [bar.d0, bar.d1]) {
        const i = Math.round(((bar.s0 + track.length) % track.length) / track.spacing) % track.n;
        expect(d).toBeLessThanOrEqual(track.left.edge[i]);
        expect(d).toBeGreaterThanOrEqual(-track.right.edge[i]);
      }
    }
  });
});
