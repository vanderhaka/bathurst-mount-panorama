import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { AttractMode } from '@/game/attract-mode';
import type { CarEntity } from '@/game/car-entity';
import { buildHudState } from '@/game/hud-bridge';
import { RaceController, type RaceDeps } from '@/game/race-controller';
import { RaceSession } from '@/game/race-session';
import { TyreFuelPanel } from '@/hud/tyre-fuel-panel';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS } from '@/types/session';
import { TouchElement } from './touch-dom-fixture';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
function entity(): CarEntity {
  const vehicle = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  vehicle.reset(900, 0);
  return {
    vehicle, livery: { number: 6, primary: 0xff0000 },
    model: { root: new THREE.Object3D(), dispose() {} },
    sync() {}, repair: () => vehicle.repair(), reset: (s: number, d: number) => vehicle.reset(s, d),
    simulate: (input: VehicleInput, dt: number, step?: (input: VehicleInput) => void) => {
      step?.(input); return vehicle.step(input, dt);
    },
  } as unknown as CarEntity;
}

describe('fuel runtime wiring without a renderer', () => {
  it('binds the racing line to the same owned profile used by the HUD and AI', () => {
    const car = entity(), session = new RaceSession('camaro', track, line, car);
    const setProfile = vi.fn();
    const race = new RaceController(session, car, { lineMesh: { setProfile }, effects: { resetAll() {} } } as unknown as RaceDeps);
    expect(setProfile).toHaveBeenCalledWith(race.profiles.player);
    expect(race.profiles.ai).not.toBe(race.profiles.player);
  });

  it('refills the endless title car when fitted and on every lap loop', () => {
    const car = entity(), v = car.vehicle;
    v.stint.fuel.reset(12);
    const attract = new AttractMode(new THREE.Scene(), new THREE.PerspectiveCamera());
    attract.set(car, line);
    expect(v.stint.fuel.litres).toBe(80);
    v.stint.fuel.reset(15);
    v.stint.placeOnTrack(track.startLineS - 1);
    v.stint.advance(v.telemetry, 1 / 360, track.startLineS + 1, track.startLineS, track.length);
    attract.frame(1 / 360, true, () => {}, new THREE.Vector3());
    expect(v.stint.fuel.litres).toBeGreaterThan(79.99);
    expect(v.stint.completedLaps).toBe(0);
  });

  it('shows real litres against the 132 L capacity with simulation-owned tyre readings', () => {
    vi.stubGlobal('document', { createElement: (tag: string) => new TouchElement(tag) });
    try {
      const car = entity(), session = new RaceSession('camaro', track, line, car);
      car.vehicle.stint.fuel.reset(132);
      const state = buildHudState(session, computeSpeedProfile(track, line, car.vehicle.spec), DEFAULT_SETTINGS, 60, null);
      const panel = new TyreFuelPanel();
      panel.update(state);
      const root = panel.el as unknown as TouchElement;
      expect(root.find('hud-fuel__v').textContent).toBe('132.0');
      expect(root.find('hud-fuel__fill').properties['--f']).toBe('1');
      expect(root.find('hud-chip--est')).toHaveProperty('hidden', true);
      expect(car.vehicle.stint.fuel.litres).toBe(132);
    } finally { vi.unstubAllGlobals(); }
  });
});
