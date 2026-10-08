import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { buildHudState, hudTrackInfo } from '@/game/hud-bridge';
import { RaceSession } from '@/game/race-session';
import { Vehicle } from '@/physics/vehicle';
import { createAdelaideTrack } from '@/track/adelaide';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { DEFAULT_SETTINGS } from '@/types/session';

describe('Adelaide altitude', () => {
  const track = createAdelaideTrack(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
  const vehicle = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  const car = {
    vehicle, livery: { number: 6, primary: 0xff0000 }, model: { root: new THREE.Object3D(), dispose() {} },
    sync() {}, repair: () => vehicle.repair(), reset: (s: number, d: number) => vehicle.reset(s, d),
  } as unknown as CarEntity;

  it('shows the sourced height above sea level (SRTM 30 m at the start line, 52 m), still marked as an estimate', () => {
    const session = new RaceSession('camaro', track, line, car);
    session.placeOnGrid();
    const state = buildHudState(session, computeSpeedProfile(track, line, vehicle.spec), DEFAULT_SETTINGS, 60, null);
    expect(state.altitudeAslM).toBeGreaterThan(51);
    expect(state.altitudeAslM).toBeLessThan(53);
    expect(Math.round(state.altitudeAslM)).toBe(52);
    expect(hudTrackInfo(track).elevationEstimated).toBe(true);
  });

  it('adds the base only to the displayed altitude: the road, car height and elevation stay flat', () => {
    expect(track.elevationBaseM).toBe(52);
    expect(Math.max(...track.py)).toBe(0);
    expect(Math.min(...track.py)).toBe(0);
    car.reset(1500, 0);
    expect(vehicle.y).toBeGreaterThan(0);
    expect(vehicle.y).toBeLessThan(1);
  });
});
