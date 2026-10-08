import * as THREE from 'three';
import { afterEach, expect, it, vi } from 'vitest';
import { CameraRig, cockpitHeaveScale } from '@/camera/camera-rig';
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
import { DEFAULT_SETTINGS, type CameraMode } from '@/types/session';
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

it('scales the flat-spot heave on the body for the cockpit view only, keeping pose, grip and the bonnet view', () => {
  const { car, body } = entity(), v = car.vehicle;
  for (let w = 0; w < 4; w++) { v.flatSpots.advance(w, 2, 50, 4000, 'road', 2); v.wheels[w].spin = Math.PI / 2; }
  v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  setGraphics({ cameraShake: 1 });
  const root = car.model.root, cockpit = car.model.cockpitCamera, bonnet = car.model.bonnetCamera;
  /** Syncs the model for a camera mode and head movement, then tilts the car so heave must follow its own up axis. */
  const sync = (mode: CameraMode, amount: number) => {
    car.sync(1 / 60, cockpitHeaveScale(mode, amount));
    root.rotation.set(0.12, 0.4, -0.08); root.position.set(2, 1, 3); root.updateMatrixWorld(true);
  };
  const target = { position: root.position, quaternion: root.quaternion, heading: v.heading, speed: v.speed,
    cockpit, bonnet, s: v.tp.s, gLong: 0, gLat: 0, headMotion: 1 };
  const rig = new CameraRig(new THREE.PerspectiveCamera(), track); rig.mode = 'cockpit';
  sync('cockpit', 0);
  expect(car.flatSpotHeave).toBe(0); expect(body.position.y).toBe(0);
  const rest = cockpit.getWorldPosition(new THREE.Vector3());
  sync('chase', 1);
  const full = car.flatSpotHeave, up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion);
  expect(full).toBeGreaterThan(0);
  for (const amount of [0, 0.5, 1]) {
    sync('cockpit', amount);
    expect(car.flatSpotHeave).toBeCloseTo(full * amount, 12); expect(body.position.y).toBe(car.flatSpotHeave);
    rig.update({ ...target, headMotion: amount }, 1 / 60);
    // The lens rides the (scaled) body with the interior: no camera-only offset on top of it.
    expect(rig.camera.position.distanceTo(cockpit.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
    expect(rig.camera.position.distanceTo(rest.clone().addScaledVector(up, full * amount))).toBeLessThan(1e-10);
    expect(rig.camera.quaternion.angleTo(cockpit.getWorldQuaternion(new THREE.Quaternion()))).toBeLessThan(1e-7);
  }
  rig.mode = 'bonnet'; sync('bonnet', 0); rig.update({ ...target, headMotion: 0 }, 1 / 60);
  expect(rig.camera.position.distanceTo(bonnet.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  expect(body.position.y).toBe(full); expect(car.flatSpotHeave).toBe(full);
  expect(v.flatSpots.tyres[0].gripMultiplier).toBeLessThan(1);
});
