import type * as THREE from 'three';
import type { QualityPreset } from '@/render/renderer';
import type { CarKind } from '@/car/car-specs';

/** A generated (not real-team) livery. */
export interface Livery {
  /** sRGB hex colours. */
  primary: number;
  secondary: number;
  accent: number;
  /** Race number painted on doors, roof and windscreen banner. */
  number: number;
  /** The race number as painted when it differs from String(number), for example '05'. */
  numberText?: string;
  /** Short text on the windscreen banner and sills (not a real sponsor). */
  banner: string;
  /** Pattern of the secondary colour on the body. 'hdt79': the 1979 Bathurst colour zones of the Torana A9X (torana only). */
  pattern: 'stripes' | 'split' | 'chevron' | 'arrow' | 'hdt79';
}

export type WheelIndex = 0 | 1 | 2 | 3; // FL, FR, RL, RR

/** One collision against the car body, in the model's local frame. */
export interface ImpactEvent {
  /** Model-local contact point (metres). */
  point: THREE.Vector3;
  /** Model-local unit vector of the impact direction INTO the body. */
  direction: THREE.Vector3;
  /** 0..1 severity of this hit (0.05 = scrape, 0.3 = hard hit, 1 = huge crash). */
  severity: number;
}

/**
 * Car model contract.
 *
 * Frame: origin on the ground plane, centred between the axles (x = 0, z = 0 at
 * mid-wheelbase). +Z = forward, +Y = up, +X = LEFT (right-handed). Metres.
 * `root` is placed in the world by the game. `body` holds everything that rolls
 * and pitches on the suspension. Wheels are NOT children of `body`.
 */
export interface CarModel {
  kind: CarKind;
  root: THREE.Group;
  body: THREE.Group;
  /** Rebuilds live livery maps for the tier, preserving geometry, pose and damage. */
  setQuality(quality: QualityPreset): void;
  /**
   * Visual body attitude in radians/metres. Implement exactly as:
   * body.rotation.set(-pitch, 0, roll) and body.position.y = heave.
   * So + pitch lifts the nose; + roll lifts the LEFT side (+X) and drops the right
   * side (this is the roll in a left turn); + heave raises the body.
   */
  setBodyAttitude(pitch: number, roll: number, heave: number): void;
  /**
   * Wheel state per frame. spin = accumulated rotation angle (rad, + = forward travel),
   * steer = road-wheel angle (rad, + = left), suspension = vertical offset (m, + = up/compressed).
   */
  setWheel(index: WheelIndex, spin: number, steer: number, suspension: number): void;
  /** Steering-wheel rotation in the cockpit, rad (+ = left turn). */
  setSteeringWheel(angle: number): void;
  setBrakeLights(on: boolean): void;
  /** Glow intensity 0..1 of the brake discs (hot brakes after heavy braking). */
  setBrakeGlow(level: number): void;
  /** Visual damage: dent the panels near the point, hang/detach parts at high severity. */
  applyImpact(impact: ImpactEvent): void;
  /** Accumulated visual damage per zone, 0..1 (for debugging and HUD cross-checks). */
  getDamageZones(): { front: number; rear: number; left: number; right: number };
  resetDamage(): void;
  /** Translucent single-colour look for the ghost car (no shadows). */
  setGhost(on: boolean): void;
  /** Live values for the in-car dash display (cockpit view). Optional: low detail has no dash. */
  setDash?(state: DashState): void;
  /** Live rear-view picture for the interior mirror (shown mirrored left/right); null = plain mirror glass. */
  setMirrorTexture?(tex: THREE.Texture | null): void;
  /** Show or hide the interior (driver, cage, dash). The game hides it for far LOD. */
  setInteriorVisible(on: boolean): void;
  /** Camera anchors (children of `body`): driver eye point and bonnet camera. Look along +Z. */
  cockpitCamera: THREE.Object3D;
  bonnetCamera: THREE.Object3D;
  /** Exhaust exit points (children of `body`) for flame/smoke effects. */
  exhausts: THREE.Object3D[];
  dispose(): void;
}

export interface DashState {
  gear: number; // -1 R, 0 N, 1..6
  speedKmh: number;
  /** 0..1 of the shift-light range. */
  shiftLights: number;
  lapS: number | null;
  deltaS: number | null;
  waterTempC: number;
}

export interface CarModelOptions {
  livery: Livery;
  /** 'high' = player car and menu preview; 'low' = ghost car and far views. */
  detail?: 'high' | 'low';
  /** Texture cap follows the graphics tier independently of the geometry detail. */
  quality?: QualityPreset;
}

export type CreateCarModel = (kind: CarKind, options: CarModelOptions) => CarModel;
