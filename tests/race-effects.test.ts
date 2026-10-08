import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { RaceEffects } from '@/game/race-effects';
import { Particles } from '@/fx/particles';
import { CAR_SPECS } from '@/car/car-specs';
import { CarEntity } from '@/game/car-entity';
import { createCarModel } from '@/car/models';
import { LIVERY_PRESETS } from '@/car/liveries';
import { QUALITY } from '@/config/graphics';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track);
const setup = (quality: 'low' | 'medium' | 'high') => {
  const scene = new THREE.Scene(), particles = new Particles(scene, { seed: 3 });
  return { scene, particles, fx: new RaceEffects(scene, { track, line }, particles, quality) };
};
const marbleMesh = (scene: THREE.Scene) => scene.getObjectByName('rubber-marbles');

describe('RaceEffects', () => {
  it('maps tiers to particle capacity and marble count', () => {
    expect(QUALITY.low.marbleCount).toBe(0); expect(QUALITY.medium.marbleCount).toBe(192); expect(QUALITY.high.marbleCount).toBe(384);
    const low = setup('low'), high = setup('high');
    expect(low.particles.snapshot().capacity).toBe(256); expect(high.particles.snapshot().capacity).toBe(512);
    const car = new CarEntity(CAR_SPECS.camaro, track, placeKerbs(track, line), createCarModel, LIVERY_PRESETS.camaro[0].livery);
    car.reset(6200, 0);
    low.fx.step(car, 1 / 60); high.fx.step(car, 1 / 60);
    expect((marbleMesh(low.scene) as THREE.InstancedMesh).count).toBe(0);
    const count = (marbleMesh(high.scene) as THREE.InstancedMesh).count;
    expect(count).toBeGreaterThan(0); expect(count).toBeLessThanOrEqual(384);
  });

  it('emits nothing when paused (dt 0) and clears particles on resetAll', () => {
    const { particles, fx } = setup('high');
    const car = new CarEntity(CAR_SPECS.camaro, track, placeKerbs(track, line), createCarModel, LIVERY_PRESETS.camaro[0].livery);
    car.reset(6200, 0);
    for (const w of car.vehicle.wheels) { w.slip = 2; w.load = 3000; w.surface = 'road'; }
    car.vehicle.vx = 40;
    fx.step(car, 0);
    expect(particles.snapshot().particles).toHaveLength(0);
    particles.emit('spark', 0, 0, 0, 0, 0, 0);
    expect(particles.snapshot().particles.length).toBeGreaterThan(0);
    fx.resetAll();
    expect(particles.snapshot().particles).toHaveLength(0);
  });

  it('removes the marble mesh on dispose and rebuilds it for a new world', () => {
    const { scene, fx } = setup('high');
    const first = marbleMesh(scene);
    expect(first).toBeDefined();
    fx.setWorld({ track, line }, 'medium');
    expect(marbleMesh(scene)).toBeDefined(); expect(marbleMesh(scene)).not.toBe(first);
    fx.dispose();
    expect(marbleMesh(scene)).toBeUndefined();
  });
});
