// The driver: lofted torso, helmet with visor and HANS collar, arms and legs.
import * as THREE from 'three';
import { loft, merge, ringSection, tint } from '@/car/models/geo-utils';

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export interface DriverColours { suit: number; helmet: number; stripe: number; visor: number; glove: number }

/** Ellipsoid-like loft along Y with a radius profile (t from 0 at the bottom to 1 at the top). */
function lathedBlob(c: THREE.Vector3, h: number, rx: number, rz: number, profile: (t: number) => number, rows: number, n: number): THREE.BufferGeometry {
  const sections: THREE.Vector3[][] = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const k = Math.max(0.02, profile(t));
    sections.push(ringSection(new THREE.Vector3(c.x, c.y + (t - 0.5) * h, c.z), X, Z, rx * k, rz * k, n, 2));
  }
  return loft(sections, true, true);
}

function limb(points: THREE.Vector3[], r0: number, r1: number, colour: number): THREE.BufferGeometry {
  const sections = points.map((p, i) => {
    const t = i / (points.length - 1);
    const dir = (i < points.length - 1 ? points[i + 1].clone().sub(p) : p.clone().sub(points[i - 1])).normalize();
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? X : Y).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    const r = r0 + (r1 - r0) * t;
    return ringSection(p, u, v, r, r, 10, 2);
  });
  return tint(loft(sections, true, true), colour);
}

/** Helmet: lofted shell, visor band coloured by vertex position. */
function helmet(eye: THREE.Vector3, c: DriverColours): THREE.BufferGeometry {
  const centre = eye.clone().add(new THREE.Vector3(0, 0.02, -0.055));
  const g = lathedBlob(centre, 0.27, 0.135, 0.155, (t) => Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) ** 0.55, 9, 14);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const dy = pos.getY(i) - eye.y, dz = pos.getZ(i) - centre.z, dx = pos.getX(i) - centre.x;
    const visor = dz > 0.05 && dy > -0.045 && dy < 0.035;
    const stripe = Math.abs(dx) < 0.03 && dy > 0.04;
    tmp.setHex(visor ? c.visor : stripe ? c.stripe : c.helmet);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Driver body (excluding the hands, which ride on the steering wheel). */
/** `reach` is how far each hand sits from the wheel centre across the wheel. */
export function buildDriver(eye: THREE.Vector3, wheelCentre: THREE.Vector3, c: DriverColours, reach = 0.15): THREE.BufferGeometry {
  const hip = new THREE.Vector3(eye.x, 0.25, eye.z - 0.02);
  const shoulder = new THREE.Vector3(eye.x, eye.y - 0.27, eye.z - 0.1);
  const parts: THREE.BufferGeometry[] = [];
  const torso: THREE.Vector3[][] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = hip.clone().lerp(shoulder, t);
    const w = 0.16 + 0.07 * Math.sin(Math.PI * Math.min(1, t * 0.9)) - (t > 0.9 ? 0.05 : 0);
    torso.push(ringSection(p, X, Z, w, 0.11 + 0.02 * Math.sin(Math.PI * t), 10, 2.2));
  }
  parts.push(tint(loft(torso, true, true), c.suit));
  const neck = eye.clone().add(new THREE.Vector3(0, -0.15, -0.07));
  parts.push(tint(loft([0, 1].map((t) => ringSection(neck.clone().add(new THREE.Vector3(0, -0.06 + t * 0.05, 0)), X, Z, 0.17 - t * 0.06, 0.14 - t * 0.05, 10, 2)), true, true), 0x202226));
  parts.push(helmet(eye, c));
  for (const s of [1, -1]) {
    const sh = shoulder.clone().add(new THREE.Vector3(s * 0.2, 0.02, 0.02));
    const hand = wheelCentre.clone().add(new THREE.Vector3(s * reach, -0.01, -0.03));
    const elbow = sh.clone().lerp(hand, 0.5).add(new THREE.Vector3(s * 0.09, -0.12, 0));
    parts.push(limb([sh, elbow, hand.clone().add(new THREE.Vector3(0, -0.01, -0.06))], 0.052, 0.04, c.suit));
    const knee = hip.clone().add(new THREE.Vector3(s * 0.11, 0.18, 0.42));
    const foot = hip.clone().add(new THREE.Vector3(s * 0.1, -0.02, 0.92));
    parts.push(limb([hip.clone().add(new THREE.Vector3(s * 0.1, 0.03, 0.05)), knee, foot], 0.075, 0.05, c.suit));
  }
  return merge(parts);
}

/** Gloves, attached to the steering wheel so they turn with it (wheel frame). */
export function buildHands(colour: number, gripX = 0.14): THREE.BufferGeometry {
  return merge([1, -1].map((s) => tint(lathedBlob(new THREE.Vector3(s * gripX, 0.005, -0.012), 0.09, 0.03, 0.038, (t) => Math.sin(Math.PI * t) ** 0.5, 6, 12), colour)));
}
