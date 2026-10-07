// Part failures driven by the accumulated damage levels: the splitter drops,
// skews and drags; the wing bends, then hangs off one upright, then tears off.
import * as THREE from 'three';
import type { HingedPart } from '@/car/models/car-parts';
import type { DamageLook } from '@/car/models/look';
import { smoothstep } from '@/car/models/curves';

export interface DamageLevels {
  front: number;
  rear: number;
  left: number;
  right: number;
  /** Mirrors the physics 'aero' zone (front and rear hits both add to it). */
  aero: number;
  /** Side (+1 left, -1 right) that took the most front/rear damage. */
  side: 1 | -1;
  wingTorn: boolean;
}

const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const euler = new THREE.Euler();

/**
 * Rotates a hinged part by `e` about the point `about` (model frame) instead of
 * its own hinge, by moving the pivot: H + (Q - H) - R (Q - H).
 */
function rotateAbout(part: HingedPart, e: THREE.Euler, about: THREE.Vector3, drop: number): void {
  const hinge = part.pivot.userData.hinge as THREE.Vector3;
  part.pivot.rotation.copy(e);
  tmpQ.setFromEuler(e);
  tmpV.copy(about).sub(hinge);
  const rotated = tmpV.clone().applyQuaternion(tmpQ);
  part.pivot.position.copy(hinge).add(tmpV).sub(rotated);
  part.pivot.position.y -= drop;
}

export function poseSplitter(part: HingedPart | null, lv: DamageLevels, dl: DamageLook): void {
  if (!part) return;
  const hang = smoothstep(dl.splitterHang, Math.min(1, dl.splitterHang + 0.3), lv.front);
  const drag = smoothstep(dl.splitterDrag, 1, lv.front);
  const hinge = part.pivot.userData.hinge as THREE.Vector3;
  // Nose drops (positive x rotation tips the front edge down), one side lower than the other.
  euler.set(hang * 0.07 + drag * 0.04, lv.side * hang * 0.1, -lv.side * (hang * 0.09 + drag * 0.05), 'XYZ');
  rotateAbout(part, euler, new THREE.Vector3(-lv.side * 0.6, hinge.y, hinge.z), hang * 0.025 + drag * 0.02);
}

export function poseWing(part: HingedPart | null, lv: DamageLevels, dl: DamageLook): void {
  if (!part) return;
  part.pivot.visible = !lv.wingTorn;
  const bend = smoothstep(dl.wingTilt, dl.wingHang, lv.aero);
  const hang = smoothstep(dl.wingHang, Math.min(1, dl.wingHang + 0.2), lv.aero);
  const hinge = part.pivot.userData.hinge as THREE.Vector3;
  const uprightX = part.pivot.userData.uprightX as number;
  const wingY = part.pivot.userData.wingY as number;
  // Bend: the plane pitches nose-down and twists. Hang: one upright lets go; the
  // plane droops around the other one and swings back so its free end hangs
  // behind the tail (roll first, then yaw: Euler order YXZ).
  euler.set(-bend * 0.3 - hang * 0.1, lv.side * (bend * 0.08 + hang * 0.6), -lv.side * (bend * 0.06 + hang * 0.35), 'YXZ');
  rotateAbout(part, euler, new THREE.Vector3(-lv.side * uprightX, wingY, hinge.z), 0);
}
