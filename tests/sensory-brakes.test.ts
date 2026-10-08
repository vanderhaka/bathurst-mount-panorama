import * as THREE from 'three';
import { afterEach, expect, it } from 'vitest';
import { CameraRig, cockpitHeaveScale } from '@/camera/camera-rig';
import { CAR_SPECS } from '@/car/car-specs';
import { getGraphics, setGraphics } from '@/config/graphics';
import { CarEntity } from '@/game/car-entity';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import type { CarModel } from '@/types/car-model';

const originalShake = getGraphics().cameraShake;
afterEach(() => setGraphics({ cameraShake: originalShake }));

it('cockpit Off removes measured brake response, shake and flat-spot heave while retaining physical body pose', () => {
  const track = new Track(), line = computeRacingLine(track);
  const root = new THREE.Group(), body = new THREE.Group();
  const cockpitCamera = new THREE.Object3D(), bonnetCamera = new THREE.Object3D();
  cockpitCamera.position.set(0.2, 1.2, 0.4); cockpitCamera.rotation.y = Math.PI;
  bonnetCamera.position.set(0, 0.8, 1.4); bonnetCamera.rotation.y = Math.PI;
  root.add(body); body.add(cockpitCamera, bonnetCamera);
  const model = { root, body, cockpitCamera, bonnetCamera,
    setBodyAttitude: (_pitch: number, _roll: number, heave: number) => { body.position.y = heave; },
    setWheel() {}, setSteeringWheel() {}, setBrakeLights() {}, setBrakeGlow() {}, resetDamage() {},
  } as unknown as CarModel;
  const car = new CarEntity(CAR_SPECS.camaro, track, placeKerbs(track, line), () => model,
    { number: 6, primary: 0xff0000, secondary: 0, accent: 0, banner: 'BATHURST', pattern: 'stripes' });
  const v = car.vehicle;
  car.reset(1300, line.offset[Math.floor(1300 / track.spacing)]);
  v.assists.abs = false; v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  let impacts = 0;
  for (let i = 0; i < 12; i++) impacts += car.simulate({ throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false }, 0.05).length;
  expect(impacts).toBe(0); expect(v.telemetry.gLong).toBeLessThan(-0.2);
  expect(v.flatSpots.tyres.some(tyre => tyre.severity > 0)).toBe(true);
  // Choose a known visual tyre phase after the real lock has damaged the set.
  for (const wheel of v.wheels) wheel.spin = Math.PI / 2;
  setGraphics({ cameraShake: 1 }); car.sync(1 / 60); root.updateMatrixWorld(true);
  expect(car.flatSpotHeave).toBeGreaterThan(0);
  const target = { position: root.position, quaternion: root.quaternion, heading: v.heading, speed: v.speed,
    cockpit: cockpitCamera, bonnet: bonnetCamera, s: v.tp.s,
    gLong: v.telemetry.gLong, gLat: v.telemetry.gLat, headMotion: 1 };
  const anchor = cockpitCamera.getWorldPosition(new THREE.Vector3());
  const orientation = cockpitCamera.getWorldQuaternion(new THREE.Quaternion());
  const heave = new THREE.Vector3(0, car.flatSpotHeave, 0).applyQuaternion(root.quaternion);
  const rootPosition = root.position.clone(), rootOrientation = root.quaternion.clone();
  const grip = v.flatSpots.tyres.map(tyre => tyre.gripMultiplier);
  const rig = new CameraRig(new THREE.PerspectiveCamera(), track); rig.mode = 'cockpit';
  for (let i = 0; i < 60; i++) rig.update(target, 1 / 60);
  expect(rig.camera.position.distanceTo(anchor)).toBeGreaterThan(0.005);
  expect(rig.camera.quaternion.angleTo(orientation)).toBeGreaterThan(0.002);
  // Off removes the synthetic heave from the body itself, so the interior stays still against the camera too.
  car.sync(1 / 60, cockpitHeaveScale('cockpit', 0)); root.updateMatrixWorld(true);
  expect(car.flatSpotHeave).toBe(0); expect(body.position.y).toBe(0);
  rig.addShake(1); rig.update({ ...target, headMotion: 0 }, 1 / 60);
  expect(rig.camera.position.distanceTo(anchor.clone().sub(heave))).toBeLessThan(1e-10);
  expect(rig.camera.position.distanceTo(cockpitCamera.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-10);
  expect(rig.camera.quaternion.angleTo(orientation)).toBeLessThan(1e-7);
  expect(root.position.equals(rootPosition)).toBe(true); expect(root.quaternion.equals(rootOrientation)).toBe(true);
  expect(v.flatSpots.tyres.map(tyre => tyre.gripMultiplier)).toEqual(grip);
});

/** Flat-spotted tyres at 50 m/s, with a steering-wheel stand-in parented to the body like the real interior. */
function heaveRig(amount: number) {
  const root = new THREE.Group(), body = new THREE.Group(), cockpitCamera = new THREE.Object3D(), bonnetCamera = new THREE.Object3D();
  const wheel = new THREE.Object3D();
  cockpitCamera.position.set(0.35, 1.05, -0.3); cockpitCamera.rotation.set(-0.05, Math.PI, 0, 'YXZ');
  wheel.position.set(0.35, 0.9, 0.15);
  root.add(body); body.add(cockpitCamera, bonnetCamera, wheel);
  const model = { root, body, cockpitCamera, bonnetCamera,
    setBodyAttitude: (_pitch: number, _roll: number, heave: number) => { body.position.y = heave; },
    setWheel() {}, setSteeringWheel() {}, setBrakeLights() {}, setBrakeGlow() {}, resetDamage() {},
  } as unknown as CarModel;
  const track = new Track(), line = computeRacingLine(track);
  const car = new CarEntity(CAR_SPECS.camaro, track, placeKerbs(track, line), () => model,
    { number: 6, primary: 0xff0000, secondary: 0, accent: 0, banner: 'BATHURST', pattern: 'stripes' });
  const v = car.vehicle;
  car.reset(1300, 0);
  for (let w = 0; w < 4; w++) v.flatSpots.advance(w, 2, 50, 4000, 'road', 2);
  v.vx = Math.sin(v.heading) * 50; v.vz = Math.cos(v.heading) * 50;
  const rig = new CameraRig(new THREE.PerspectiveCamera(62, 16 / 9), track); rig.mode = 'cockpit';
  const target = { position: root.position, quaternion: root.quaternion, heading: v.heading, speed: v.speed,
    cockpit: cockpitCamera, bonnet: bonnetCamera, s: v.tp.s, gLong: 0, gLat: 0, headMotion: amount };
  /** One rendered frame with the tyres at a rotation phase; returns what the player sees. */
  const frame = (phase: number) => {
    for (const w of v.wheels) w.spin = phase;
    car.sync(1 / 60, cockpitHeaveScale(rig.mode, amount)); root.updateMatrixWorld(true);
    rig.update(target, 1 / 60); rig.camera.updateMatrixWorld(true);
    return { inCamera: rig.camera.worldToLocal(wheel.getWorldPosition(new THREE.Vector3())),
      camera: rig.camera.getWorldPosition(new THREE.Vector3()), heave: car.flatSpotHeave, bodyY: body.position.y };
  };
  return { car, root, rig, frame };
}

it('head movement Off leaves the cockpit still: interior fixed to the lens and lens fixed in the world', () => {
  setGraphics({ cameraShake: 1 });
  const swing: Record<number, number> = {};
  for (const amount of [1, 0.5, 0]) {
    const { frame } = heaveRig(amount);
    const a = frame(Math.PI / 2), b = frame(3 * Math.PI / 2);
    // The wheel, dash and cage never move against the lens (camera-only scaling made them jitter most at Off).
    expect(a.inCamera.distanceTo(b.inCamera)).toBeLessThan(1e-9);
    swing[amount] = a.camera.distanceTo(b.camera);
    expect(Math.abs(a.bodyY - b.bodyY)).toBeCloseTo(swing[amount], 9);
  }
  expect(swing[1]).toBeGreaterThan(0.002); // tyre-phase heave reaches the whole head at 100 %
  expect(swing[0.5]).toBeCloseTo(swing[1] / 2, 9);
  expect(swing[0]).toBe(0); // Off: the camera does not move in the world
});

it('cockpit heave scaling leaves physical pose and grip alone, and every other camera keeps the full heave', () => {
  setGraphics({ cameraShake: 1 });
  const { car, root, rig, frame } = heaveRig(0);
  const off = frame(Math.PI / 2);
  expect(off.heave).toBe(0); expect(off.bodyY).toBe(0);
  const position = root.position.clone(), orientation = root.quaternion.clone();
  const grip = car.vehicle.flatSpots.tyres.map((tyre) => tyre.gripMultiplier);
  frame(3 * Math.PI / 2);
  expect(root.position.equals(position)).toBe(true); expect(root.quaternion.equals(orientation)).toBe(true);
  expect(car.vehicle.flatSpots.tyres.map((tyre) => tyre.gripMultiplier)).toEqual(grip);
  for (const mode of ['bonnet', 'chase', 'chaseFar', 'tv'] as const) {
    rig.mode = mode;
    const seen = frame(Math.PI / 2);
    expect(seen.heave).toBeGreaterThan(0.001); expect(seen.bodyY).toBe(seen.heave);
  }
  car.sync(1 / 60); // other cars and the attract-mode car use the default scale
  expect(car.flatSpotHeave).toBeGreaterThan(0.001);
});
