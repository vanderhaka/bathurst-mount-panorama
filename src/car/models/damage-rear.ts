// Rear-corner failures that read from the chase camera, the view the player
// uses most. A rear corner fails once it has taken 0.5 damage itself, or once
// the whole rear zone passes 0.45 (then the corner that took most of it): its
// bumper corner hangs, its diffuser corner drags on the ground, its tail lamp
// goes dark, and the wing endplate on that side skews; above 0.8 the endplate
// is gone.
import * as THREE from 'three';
import type { Dent, Field } from '@/car/models/damage-field';
import type { LightSet } from '@/car/models/lights';
import type { AtlasRegion } from '@/car/models/livery-layout';

export type Corner = 'left' | 'right';

export const CORNER_HANG = 0.5;
export const REAR_ZONE_HANG = 0.45;
export const ENDPLATE_LOST = 0.8;

export interface RearState {
  level: Record<Corner, number>;
  hung: Record<Corner, boolean>;
}

export function rearState(): RearState {
  return { level: { left: 0, right: 0 }, hung: { left: false, right: false } };
}

export function resetRear(r: RearState): void {
  r.level.left = r.level.right = 0;
  r.hung.left = r.hung.right = false;
}

/** Adds a hit on the rear half of the car to the corner(s) it loads. */
export function loadRear(r: RearState, c: THREE.Vector3, sev: number): void {
  const centre = Math.abs(c.x) < 0.15;
  const corners: Corner[] = centre ? ['left', 'right'] : [c.x > 0 ? 'left' : 'right'];
  for (const k of corners) r.level[k] = Math.min(1, r.level[k] + sev * (centre ? 0.45 : 0.9));
}

/** Corners that just crossed the hang threshold (marks them hung). `rearZone` is the rear damage level. */
export function newlyHung(r: RearState, rearZone: number): Corner[] {
  const out: Corner[] = [];
  const worst: Corner = r.level.left >= r.level.right ? 'left' : 'right';
  for (const k of ['left', 'right'] as Corner[]) {
    const failed = r.level[k] >= CORNER_HANG || (k === worst && rearZone >= REAR_ZONE_HANG);
    if (!r.hung[k] && failed) {
      r.hung[k] = true;
      out.push(k);
    }
  }
  return out;
}

/** Dents that drop the bumper corner and push the diffuser corner down onto the road. */
export function hangDents(corner: Corner, zRear: number): Dent[] {
  const s = corner === 'left' ? 1 : -1;
  return [
    { c: new THREE.Vector3(s * 0.8, 0.3, zRear + 0.12), dir: new THREE.Vector3(s * 0.35, -1, -0.15).normalize(), radius: 0.55, depth: 0.15, facingFloor: 1 },
    { c: new THREE.Vector3(s * 0.5, 0.14, zRear + 0.22), dir: new THREE.Vector3(0, -1, 0), radius: 0.5, depth: 0.14, facingFloor: 1 },
  ];
}

/** Darkens the tail lamp on one side (no glow). */
export function killTail(lights: LightSet, corner: Corner, broken: THREE.Material): void {
  const m = lights.tail.material;
  if (Array.isArray(m)) m[corner === 'left' ? 0 : 1] = broken;
}

const q = new THREE.Quaternion();
const v = new THREE.Vector3();

/**
 * Endplates (both in one mesh, split by the sign of x): a damaged side swings
 * down and outwards about its top front corner; a lost side collapses to that
 * corner (invisible). Written into the field's extra offset.
 */
export function poseEndplates(field: Field, r: RearState): void {
  const rest = field.rest;
  const n = rest.length / 3;
  field.extra ??= new Float32Array(rest.length);
  field.extra.fill(0);
  for (const k of ['left', 'right'] as Corner[]) {
    if (!r.hung[k]) continue;
    const s = k === 'left' ? 1 : -1;
    let top = -Infinity, front = -Infinity, xs = 0, count = 0;
    for (let i = 0; i < n; i++) {
      if (rest[i * 3] * s <= 0) continue;
      top = Math.max(top, rest[i * 3 + 1]);
      front = Math.max(front, rest[i * 3 + 2]);
      xs += rest[i * 3];
      count++;
    }
    if (!count) continue;
    const pivot = new THREE.Vector3(xs / count, top, front);
    const lost = r.level[k] >= ENDPLATE_LOST;
    q.setFromEuler(new THREE.Euler(-0.9, 0, s * 0.35));
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      if (rest[j] * s <= 0) continue;
      v.set(rest[j], rest[j + 1], rest[j + 2]);
      const to = lost ? pivot : v.clone().sub(pivot).applyQuaternion(q).add(pivot);
      field.extra[j] = to.x - v.x;
      field.extra[j + 1] = to.y - v.y;
      field.extra[j + 2] = to.z - v.z;
    }
  }
}

/**
 * Extra scrape patches for a rear-half hit, placed where the chase camera
 * sees them: on the boot deck and on the tail or rear quarter.
 */
export function rearScrapes(c: THREE.Vector3, zRear: number): Array<[AtlasRegion, number, number]> {
  const x = Math.max(-0.8, Math.min(0.8, c.x));
  const out: Array<[AtlasRegion, number, number]> = [['top', Math.max(c.z, zRear + 0.3), x], ['rear', x, 0.5]];
  if (Math.abs(c.x) > 0.3) out.push([c.x > 0 ? 'sideL' : 'sideR', Math.max(c.z, zRear + 0.35), 0.5]);
  return out;
}
