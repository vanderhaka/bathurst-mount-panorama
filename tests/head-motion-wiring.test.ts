import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cockpitHeaveScale, type CameraRig } from '@/camera/camera-rig';
import { CAR_SPECS } from '@/car/car-specs';
import { getGraphics, setGraphics } from '@/config/graphics';
import { CarEntity } from '@/game/car-entity';
import { RaceController, type RaceDeps } from '@/game/race-controller';
import { RaceSession } from '@/game/race-session';
import type { InputManager } from '@/input/input-manager';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import type { CarModel } from '@/types/car-model';
import { DEFAULT_SETTINGS, type CameraMode } from '@/types/session';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const originalShake = getGraphics().cameraShake;
afterEach(() => setGraphics({ cameraShake: originalShake }));

describe('cockpit heave scale', () => {
  it('follows the head movement setting in the cockpit view only', () => {
    expect(cockpitHeaveScale('cockpit', 0)).toBe(0);
    expect(cockpitHeaveScale('cockpit', 0.5)).toBe(0.5);
    expect(cockpitHeaveScale('cockpit', 1)).toBe(1);
    expect(cockpitHeaveScale('cockpit', 7)).toBe(1);
    expect(cockpitHeaveScale('cockpit', -1)).toBe(0);
    expect(cockpitHeaveScale('cockpit', Number.NaN)).toBe(DEFAULT_SETTINGS.headMotion); // same fallback as the camera
    for (const mode of ['chase', 'chaseFar', 'bonnet', 'tv'] as const) expect(cockpitHeaveScale(mode, 0)).toBe(1);
  });
});

/** The real race frame, with stub input, HUD and renderer around a real car and session. */
function raceFrame(mode: CameraMode, headMotion: number) {
  const root = new THREE.Group(), body = new THREE.Group(), cockpitCamera = new THREE.Object3D(), bonnetCamera = new THREE.Object3D();
  root.add(body); body.add(cockpitCamera, bonnetCamera);
  const model = { root, body, cockpitCamera, bonnetCamera,
    setBodyAttitude: (_pitch: number, _roll: number, heave: number) => { body.position.y = heave; },
    setWheel() {}, setSteeringWheel() {}, setBrakeLights() {}, setBrakeGlow() {}, resetDamage() {},
  } as unknown as CarModel;
  const car = new CarEntity(CAR_SPECS.camaro, track, kerbs, () => model,
    { number: 6, primary: 0xff0000, secondary: 0, accent: 0, banner: 'BATHURST', pattern: 'stripes' });
  const session = new RaceSession('camaro', track, line, car);
  session.placeOnGrid();
  const v = car.vehicle;
  for (let w = 0; w < 4; w++) { v.flatSpots.advance(w, 2, 50, 4000, 'road', 2); v.wheels[w].spin = Math.PI / 2; }
  v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  setGraphics({ cameraShake: 1 });
  const renderer = { shadowMap: { autoUpdate: true }, getRenderTarget: () => null, setRenderTarget() {}, render() {} };
  const deps = {
    input: { steerSensitivity: { keyboard: 1, pad: 1, touch: 1 }, consume: () => false, rumble() {},
      update: () => ({ steer: 0, throttle: 0, brake: 0, analogSteer: false }) } as unknown as InputManager,
    rig: { mode, lookBack: false, addShake() {} } as unknown as CameraRig,
    hud: { update() {} }, lineMesh: { setProfile() {}, update() {}, mode: 'off' }, audio: null, ghostModel: null,
    particles: { emit() {} }, startLights() {}, stage: { renderer, scene: new THREE.Scene() },
    settings: () => ({ ...DEFAULT_SETTINGS, headMotion, damage: 'off' as const }),
  } as unknown as RaceDeps;
  const sync = vi.spyOn(car, 'sync');
  new RaceController(session, car, deps).frame(1 / 60, null);
  return { car, body, sync };
}

describe('race frame heave wiring', () => {
  it('syncs the player car with the cockpit heave scale for the live camera and setting', () => {
    const off = raceFrame('cockpit', 0);
    expect(off.sync).toHaveBeenCalledWith(1 / 60, 0);
    expect(Math.abs(off.car.flatSpotHeave)).toBe(0); expect(Math.abs(off.body.position.y)).toBe(0);
    const half = raceFrame('cockpit', 0.5);
    expect(half.sync).toHaveBeenCalledWith(1 / 60, 0.5);
    const full = raceFrame('cockpit', 1);
    expect(Math.abs(full.car.flatSpotHeave)).toBeGreaterThan(0.0005);
    expect(half.car.flatSpotHeave).toBeCloseTo(full.car.flatSpotHeave / 2, 12);
  });

  it('keeps the full heave in the bonnet, chase and TV views whatever the setting', () => {
    const reference = raceFrame('chase', 1).car.flatSpotHeave;
    expect(Math.abs(reference)).toBeGreaterThan(0.0005);
    for (const mode of ['bonnet', 'chase', 'chaseFar', 'tv'] as const) {
      const seen = raceFrame(mode, 0);
      expect(seen.sync).toHaveBeenCalledWith(1 / 60, 1);
      expect(seen.car.flatSpotHeave).toBe(reference);
    }
  });
});
