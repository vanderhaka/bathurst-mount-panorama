// Moulded carbon dash: a lofted tray across the car with a gently curved top,
// a rolled rear lip and a lighter edge line, a deeper instrument section in
// front of the driver, and an arched cowl over the display.
import * as THREE from 'three';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, loft, merge, tint } from '@/car/models/geo-utils';
import { tube } from '@/car/models/interior-cage';

export interface Dash { geo: THREE.BufferGeometry; top: number; rearZ: number }

const CARBON = 0x1c1d20;
const EDGE = 0x5a5e65;
const HALF_W = 0.72;

/** Bell curve 1 at x0, 0 beyond +/- w. */
function bell(x: number, x0: number, w: number): number {
  const t = Math.min(1, Math.abs(x - x0) / w);
  return (1 - t * t) ** 2;
}

/**
 * Dash section at x in the (z, y) plane, from the windscreen base round the
 * top, over the rolled rear lip and back along the underside.
 */
function section(x: number, zF: number, rearZ: number, top: number, eyeX: number): Array<[number, number]> {
  const side = 1 - 0.5 * (Math.abs(x) / HALF_W) ** 4; // drops towards the doors
  const deep = bell(x, eyeX, 0.3); // instrument section reaches further back
  const rz = rearZ - 0.035 * deep;
  const zM = (zF + rz) / 2;
  const crown = 0.016 * side;
  return [
    [zF, top - 0.012],
    [zM, top + crown - 0.02 * (1 - side)],
    [rz + 0.035, top + crown * 0.4 - 0.02 * (1 - side)],
    [rz + 0.008, top - 0.012],
    [rz, top - 0.04],
    [rz + 0.03, top - 0.16],
    [rz + 0.09, top - 0.25],
    [zF, top - 0.3],
  ];
}

export function mouldedDash(p: BodyProfile, cv: CurveSet, eye: THREE.Vector3): Dash {
  const zF = p.z.cowl + 0.02;
  const top = cv.topY(p.z.cowl) - 0.075;
  const rearZ = eye.z + 0.56;
  const xs = [-HALF_W, -0.6, -0.48, -0.36, -0.24, -0.12, 0, 0.18, 0.36, 0.54, HALF_W];
  const sections = xs.map((x) => section(x, zF, rearZ, top, eye.x).map(([z, y]) => new THREE.Vector3(x, y, z)));
  const body = tint(loft(sections, true, true), CARBON);
  // Edge line along the rolled rear lip.
  const edge = tube(xs.map((x) => {
    const [z, y] = section(x, zF, rearZ, top, eye.x)[3];
    return new THREE.Vector3(x, y + 0.002, z - 0.003);
  }), 0.0045, EDGE, { radial: 5, perPoint: 2 });
  return { geo: merge([body, edge]), top, rearZ };
}

/** Arched cowl over the display (driver-facing opening), thin carbon shell. */
export function displayCowl(d: Dash, eye: THREE.Vector3): THREE.BufferGeometry {
  const cx = eye.x;
  const cy = d.top - 0.005;
  const rx = 0.2, ry = 0.15, t = 0.012;
  const arch: Array<readonly [number, number]> = [];
  const n = 10;
  const ang = (i: number) => Math.PI * (0.04 + (0.92 * i) / n);
  for (let i = 0; i <= n; i++) arch.push([cx + rx * Math.cos(ang(i)), cy + ry * Math.sin(ang(i))]);
  for (let i = n; i >= 0; i--) arch.push([cx + (rx - t) * Math.cos(ang(i)), cy + (ry - t) * Math.sin(ang(i))]);
  // Rear (driver) edge overhangs the dash lip; the front edge dips into the dash top.
  const z0 = d.rearZ - 0.03;
  const len = 0.17;
  return tint(extrude(arch, len, (a, b, k) => [a, b - 0.015 * (k / len), z0 + k]), CARBON);
}
