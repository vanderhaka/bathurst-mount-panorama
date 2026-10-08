import * as THREE from 'three';
import { afterEach, expect, it } from 'vitest';
import { CameraRig } from '@/camera/camera-rig';
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
    cockpit: cockpitCamera, bonnet: bonnetCamera, s: v.tp.s, flatSpotHeave: car.flatSpotHeave,
    gLong: v.telemetry.gLong, gLat: v.telemetry.gLat, headMotion: 1 };
  const anchor = cockpitCamera.getWorldPosition(new THREE.Vector3());
  const orientation = cockpitCamera.getWorldQuaternion(new THREE.Quaternion());
  const heave = new THREE.Vector3(0, car.flatSpotHeave, 0).applyQuaternion(root.quaternion);
  const bodyPosition = body.position.clone(), rootOrientation = root.quaternion.clone();
  const grip = v.flatSpots.tyres.map(tyre => tyre.gripMultiplier);
  const rig = new CameraRig(new THREE.PerspectiveCamera(), track); rig.mode = 'cockpit';
  for (let i = 0; i < 60; i++) rig.update(target, 1 / 60);
  expect(rig.camera.position.distanceTo(anchor)).toBeGreaterThan(0.005);
  expect(rig.camera.quaternion.angleTo(orientation)).toBeGreaterThan(0.002);
  rig.addShake(1); rig.update({ ...target, headMotion: 0 }, 1 / 60);
  expect(rig.camera.position.distanceTo(anchor.clone().sub(heave))).toBeLessThan(1e-10);
  expect(rig.camera.quaternion.angleTo(orientation)).toBeLessThan(1e-7);
  expect(body.position.equals(bodyPosition)).toBe(true); expect(root.quaternion.equals(rootOrientation)).toBe(true);
  expect(v.flatSpots.tyres.map(tyre => tyre.gripMultiplier)).toEqual(grip);
});
