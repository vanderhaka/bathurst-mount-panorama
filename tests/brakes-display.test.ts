import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { CameraRig } from '@/camera/camera-rig';
import { CAR_SPECS } from '@/car/car-specs';
import { getGraphics, setGraphics } from '@/config/graphics';
import { CarEntity } from '@/game/car-entity';
import { buildHudState } from '@/game/hud-bridge';
import { RaceSession } from '@/game/race-session';
import { TyreFuelPanel } from '@/hud/tyre-fuel-panel';
import { brakeGlow } from '@/physics/brake-heat';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import type { CarModel } from '@/types/car-model';
import { DEFAULT_SETTINGS } from '@/types/session';
import { TouchElement } from './touch-dom-fixture';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const originalShake = getGraphics().cameraShake;
afterEach(() => { vi.unstubAllGlobals(); setGraphics({ cameraShake: originalShake }); });

/** Real body hierarchy and anchors, with no materials, renderer or GPU. */
function entity() {
  const root = new THREE.Group(), body = new THREE.Group(), cockpitCamera = new THREE.Object3D(), bonnetCamera = new THREE.Object3D();
  root.add(body); body.add(cockpitCamera, bonnetCamera);
  let glow = 0;
  const model = { root, body, cockpitCamera, bonnetCamera,
    setBodyAttitude: (_pitch: number, _roll: number, heave: number) => { body.position.y = heave; },
    setWheel() {}, setSteeringWheel() {}, setBrakeLights() {}, resetDamage() {},
    setBrakeGlow: (value: number) => { glow = value; },
  } as unknown as CarModel;
  const car = new CarEntity(CAR_SPECS.camaro, track, kerbs, () => model,
    { number: 6, primary: 0xff0000, secondary: 0, accent: 0, banner: 'BATHURST', pattern: 'stripes' });
  car.reset(1300, 0);
  return { car, body, glow: () => glow };
}

it('reads real brake °C and fade in the HUD without changing the fixed simulation state', () => {
  vi.stubGlobal('document', { createElement: (tag: string) => new TouchElement(tag) });
  const { car } = entity(), v = car.vehicle;
  v.brakes.reset(820);
  const race = new RaceSession('camaro', track, line, car);
  const profile = computeSpeedProfile(track, line, v.spec);
  const state = buildHudState(race, profile, DEFAULT_SETTINGS, 60, null);
  expect(state.brakes).toBe(v.telemetry.brakes);
  const panel = new TyreFuelPanel(); panel.update(state);
  const el = panel.el as unknown as TouchElement;
  expect(el.find('hud-brakes__front').textContent).toBe('820');
  expect(el.find('hud-brakes__rear').textContent).toBe('820');
  expect(el.find('hud-brakes').dataset.fade).toBe('true');
  expect(el.find('hud-brakes__fade').textContent).toContain('FADE');
  expect(el.attributes['aria-label']).toBe('Tyres, brakes and fuel');
  for (let frame = 0; frame < 120; frame++) panel.update(buildHudState(race, profile, DEFAULT_SETTINGS, 60, state));
  expect(v.brakes.discs.every((disc) => disc.tempC === 820 && disc.energyJ === 0)).toBe(true);
  v.brakes.reset(22); panel.update(state);
  expect(el.find('hud-brakes__front').textContent).toBe('22');
  expect(el.find('hud-brakes').dataset.fade).toBe('false');
});

it('uses actual disc temperature for glow and bounded tyre-phase heave for body and in-car anchors', () => {
  const fixture = entity(), { car, body } = fixture, v = car.vehicle;
  v.brakes.reset(820);
  for (let w = 0; w < 4; w++) { v.flatSpots.advance(w, 2, 50, 4000, 'road', 2); v.wheels[w].spin = Math.PI / 2; }
  v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  setGraphics({ cameraShake: 1 });
  car.sync(1 / 60);
  expect(fixture.glow()).toBe(brakeGlow(820));
  expect(body.position.y).toBeGreaterThan(0); expect(body.position.y).toBeLessThanOrEqual(0.0024);
  const camera = new THREE.PerspectiveCamera(), rig = new CameraRig(camera, track); rig.mode = 'cockpit';
  const target = { position: car.model.root.position, quaternion: car.model.root.quaternion, heading: v.heading, speed: v.speed,
    cockpit: car.model.cockpitCamera, bonnet: car.model.bonnetCamera, s: v.tp.s, gLong: 0, gLat: 0, headMotion: 1 };
  rig.update(target, 1 / 60); const y = camera.position.y;
  for (const wheel of v.wheels) wheel.spin = 3 * Math.PI / 2;
  car.sync(1 / 60); rig.update(target, 1 / 60);
  expect(camera.position.y).toBeLessThan(y); expect(y - camera.position.y).toBeLessThanOrEqual(0.0048 + 1e-9);
  expect(v.brakes.discs.every((disc) => disc.tempC === 820)).toBe(true);
  const grip = v.flatSpots.tyres[0].gripMultiplier;
  setGraphics({ cameraShake: 0 }); car.sync(1 / 60);
  expect(Math.abs(body.position.y)).toBe(0); expect(v.flatSpots.tyres[0].gripMultiplier).toBe(grip); expect(grip).toBeLessThan(1);
  v.brakes.reset(22); car.sync(1 / 60); expect(fixture.glow()).toBe(0);
});

it('scales only flat-spot cockpit displacement with head movement while keeping body pose and grip', () => {
  const { car, body } = entity(), v = car.vehicle;
  for (let w = 0; w < 4; w++) { v.flatSpots.advance(w, 2, 50, 4000, 'road', 2); v.wheels[w].spin = Math.PI / 2; }
  v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  setGraphics({ cameraShake: 1 }); car.sync(1 / 60);
  car.model.root.rotation.set(0.12, 0.4, -0.08); car.model.root.position.set(2, 1, 3);
  car.model.root.updateMatrixWorld(true);
  const target = { position: car.model.root.position, quaternion: car.model.root.quaternion, heading: v.heading, speed: v.speed,
    cockpit: car.model.cockpitCamera, bonnet: car.model.bonnetCamera, s: v.tp.s, flatSpotHeave: car.flatSpotHeave,
    gLong: 0, gLat: 0, headMotion: 1 };
  const rig = new CameraRig(new THREE.PerspectiveCamera(), track); rig.mode = 'cockpit';
  const anchor = car.model.cockpitCamera.getWorldPosition(new THREE.Vector3());
  const heave = new THREE.Vector3(0, car.flatSpotHeave, 0).applyQuaternion(target.quaternion);
  rig.update({ ...target, headMotion: 0 }, 1 / 60);
  expect(rig.camera.position.distanceTo(anchor.clone().sub(heave))).toBeLessThan(1e-10);
  expect(rig.camera.quaternion.angleTo(car.model.cockpitCamera.getWorldQuaternion(new THREE.Quaternion()))).toBeLessThan(1e-7);
  rig.update({ ...target, headMotion: 0.5 }, 1 / 60);
  expect(rig.camera.position.distanceTo(anchor.clone().addScaledVector(heave, -0.5))).toBeLessThan(1e-10);
  rig.update(target, 1 / 60); expect(rig.camera.position.distanceTo(anchor)).toBeLessThan(1e-10);
  rig.mode = 'bonnet'; rig.update({ ...target, headMotion: 0 }, 1 / 60);
  expect(rig.camera.position.distanceTo(car.model.bonnetCamera.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  expect(body.position.y).toBe(car.flatSpotHeave); expect(body.position.y).toBeGreaterThan(0);
  expect(v.flatSpots.tyres[0].gripMultiplier).toBeLessThan(1);
});
