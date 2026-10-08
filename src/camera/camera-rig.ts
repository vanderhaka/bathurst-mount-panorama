import * as THREE from 'three';
import { HeadMotion, headMotionAmount } from '@/camera/head-motion';
import { getGraphics } from '@/config/graphics';
import type { Track } from '@/track/track-model';
import { tvCameraIndex, tvCameraPoint } from '@/track/tv-cameras';
import type { CameraMode } from '@/types/session';

export const CAMERA_ORDER: CameraMode[] = ['chase', 'chaseFar', 'bonnet', 'cockpit', 'tv'];

/**
 * Scale for the player car's synthetic (flat-spot) body heave. The cockpit camera and the whole interior
 * ride on the body, so the head movement setting must scale the heave itself: scaling it on the camera
 * alone leaves the interior shaking against a fixed lens. Every other view keeps the full heave.
 */
export function cockpitHeaveScale(mode: CameraMode, headMotion: number): number {
  return mode === 'cockpit' ? headMotionAmount(headMotion) : 1;
}

export interface CameraTarget {
  /** Car root transform (world). */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  heading: number;
  speed: number;
  /** Measured longitudinal (+ accelerating) and lateral (+ left) acceleration in g. */
  gLong: number;
  gLat: number;
  headMotion: number;
  /** World-space anchors from the car model. */
  cockpit: THREE.Object3D;
  bonnet: THREE.Object3D;
  /** Track distance of the car (for TV cameras). */
  s: number;
}

/**
 * Race cameras. Chase cameras use critically damped springs so they lag
 * naturally; in-car cameras are rigid with small shake. FOV widens with speed.
 */
export class CameraRig {
  mode: CameraMode = 'chase';
  lookBack = false;
  private readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private initialised = false;
  private shake = 0;
  private shakeT = 0;
  private readonly head = new HeadMotion();
  private tvIndex = -1;
  private readonly tvPos = new THREE.Vector3();
  private readonly tmp: [number, number, number] = [0, 0, 0];

  constructor(readonly camera: THREE.PerspectiveCamera, private readonly track: Track) {}

  cycle(): CameraMode {
    this.mode = CAMERA_ORDER[(CAMERA_ORDER.indexOf(this.mode) + 1) % CAMERA_ORDER.length];
    this.initialised = false;
    this.head.reset();
    return this.mode;
  }

  /** Adds camera shake (0..1), for kerbs, grass and impacts. */
  addShake(amount: number): void {
    this.shake = Math.min(1, Math.max(this.shake, amount));
  }

  snap(): void {
    this.initialised = false;
    this.head.reset();
  }

  update(t: CameraTarget, dt: number): void {
    const cam = this.camera;
    const g = getGraphics();
    const kmh = Math.abs(t.speed) * 3.6;
    const fwd = new THREE.Vector3(Math.sin(t.heading), 0, Math.cos(t.heading));
    const back = this.lookBack ? -1 : 1;
    this.shakeT += dt;
    this.shake *= Math.exp(-dt * 5);
    const sh = this.shake * g.cameraShake * (this.mode === 'cockpit' ? headMotionAmount(t.headMotion) : 1);
    if (this.mode !== 'cockpit' || this.lookBack) this.head.reset();
    const jitter = new THREE.Vector3(Math.sin(this.shakeT * 53) * 0.02, Math.sin(this.shakeT * 71) * 0.015, 0).multiplyScalar(sh);

    if ((this.mode === 'cockpit' || this.mode === 'bonnet') && this.lookBack) {
      // Look back from the in-car views: a roof camera above the rear window, facing
      // backwards over the wing (the cabin's rear bulkhead blocks the driver's own view).
      cam.position.copy(REAR_CAM).applyQuaternion(t.quaternion).add(t.position).add(jitter);
      cam.quaternion.copy(t.quaternion).multiply(REAR_TILT);
      cam.fov = g.fov;
      cam.near = 0.05;
    } else if (this.mode === 'cockpit' || this.mode === 'bonnet') {
      const anchor = this.mode === 'cockpit' ? t.cockpit : t.bonnet;
      anchor.getWorldPosition(cam.position);
      // The model's anchors are pre-oriented like three.js cameras (they look along the car's +Z).
      anchor.getWorldQuaternion(cam.quaternion);
      if (this.mode === 'cockpit') {
        const head = this.head.update(t.gLong, t.gLat, t.headMotion, dt);
        cam.position.add(new THREE.Vector3(head.x, 0, head.z).applyQuaternion(cam.quaternion));
        cam.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(head.pitch, 0, head.roll, 'YXZ')));
      }
      cam.position.add(jitter);
      cam.fov = (this.mode === 'cockpit' ? g.fov - 4 : g.fov) + Math.min(8, kmh / 40);
      cam.near = 0.05;
    } else if (this.mode === 'tv') {
      this.updateTv(t);
    } else {
      const far = this.mode === 'chaseFar';
      const dist = far ? 9.5 : 6.2;
      const height = far ? 3.1 : 2.05;
      const desired = t.position.clone().addScaledVector(fwd, -dist * back).add(new THREE.Vector3(0, height, 0));
      if (!this.initialised) {
        this.pos.copy(desired);
        this.vel.set(0, 0, 0);
        this.initialised = true;
      }
      // Critically damped spring towards the desired point.
      const k = far ? 38 : 60;
      const c = 2 * Math.sqrt(k);
      const acc = desired.clone().sub(this.pos).multiplyScalar(k).addScaledVector(this.vel, -c);
      this.vel.addScaledVector(acc, dt);
      this.pos.addScaledVector(this.vel, dt);
      // Never fall below the car's roof line too far, never lag more than 4 m.
      const lag = this.pos.distanceTo(desired);
      if (lag > 4) this.pos.lerp(desired, 1 - 4 / lag);
      cam.position.copy(this.pos).add(jitter);
      this.look.copy(t.position).addScaledVector(fwd, 4 * back).add(new THREE.Vector3(0, far ? 1.0 : 0.95, 0));
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      cam.fov = g.fov + Math.min(12, kmh / 26);
      cam.near = 0.1;
    }
    cam.updateProjectionMatrix();
  }

  private updateTv(t: CameraTarget): void {
    const cam = this.camera;
    // Trackside cameras (src/track/tv-cameras.ts); the scenery keeps their sight lines clear of trees.
    const idx = tvCameraIndex(this.track, t.s);
    if (idx !== this.tvIndex) {
      this.tvIndex = idx;
      tvCameraPoint(this.track, idx, this.tmp);
      this.tvPos.set(this.tmp[0], this.tmp[1], this.tmp[2]);
    }
    cam.position.copy(this.tvPos);
    cam.lookAt(t.position.x, t.position.y + 0.6, t.position.z);
    const dist = this.tvPos.distanceTo(t.position);
    cam.fov = THREE.MathUtils.clamp((2 * Math.atan(9 / dist) * 180) / Math.PI, 6, 55);
    cam.near = 0.5;
  }
}

/** Rear roof camera in the car frame (+Z forward), and its slight downward tilt. A camera looks along its -Z, so the car frame itself faces backwards. */
const REAR_CAM = new THREE.Vector3(0, 1.62, -0.9);
const REAR_TILT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.1);
