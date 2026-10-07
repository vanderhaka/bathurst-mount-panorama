// Roll cage: main hoop, A-pillar hoop with the windscreen cross bar, roof
// (halo) bars, rear stays and door bars. Built at two densities: a detailed
// one for the cockpit cameras and a cheap one for outside views.
import * as THREE from 'three';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyProfile } from '@/car/models/profile-types';
import { merge, tint } from '@/car/models/geo-utils';
import { clamp, lerp } from '@/car/models/curves';

export interface TubeDensity { radial: number; perPoint: number }

export const CAGE_DETAIL: TubeDensity = { radial: 8, perPoint: 4 };
export const CAGE_SIMPLE: TubeDensity = { radial: 4, perPoint: 2 };

export function tube(points: THREE.Vector3[], r: number, colour: number, d: TubeDensity = CAGE_DETAIL, closed = false): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return tint(new THREE.TubeGeometry(curve, Math.max(2, points.length * d.perPoint), r, d.radial, closed), colour);
}

export function buildCage(p: BodyProfile, cv: CurveSet, zHoop: number, colour: number, d: TubeDensity): THREE.BufferGeometry {
  const inner = (z: number, y: number) => {
    const gb = cv.glassBaseY(z);
    const rail = z <= p.z.sideFront && z >= p.z.sideRear ? Math.max(cv.railY(z), gb + 0.01) : gb + 0.01;
    if (y <= gb) return Math.min(cv.maxX(z), cv.shoulderX(z)) - 0.15;
    const t = clamp((y - gb) / (rail - gb), 0, 1);
    return lerp(cv.glassBaseX(z), cv.railX(z), t) - 0.075;
  };
  const roofY = (z: number) => cv.topY(z) - 0.06;
  const top = (z: number, s: number) => new THREE.Vector3(s * (cv.railX(z) - 0.12), roofY(z) - 0.012, z);
  const parts: THREE.BufferGeometry[] = [];
  const r = 0.02;
  const hoop = [-1, 1].flatMap((s, i) => {
    const pts = [new THREE.Vector3(s * inner(zHoop, 0.2), 0.16, zHoop), new THREE.Vector3(s * inner(zHoop, 0.85), 0.85, zHoop), top(zHoop, s)];
    return i === 0 ? pts : pts.reverse();
  });
  parts.push(tube(hoop, r, colour, d));
  // A-pillar bars follow the windscreen pillars down to the dash, joined by the cross bar at the screen top.
  const zA = p.z.cowl - 0.1;
  const zR = p.z.roofFront - 0.04;
  const pillar = (s: number) => [0, 0.33, 0.66, 1].map((t) => {
    const z = lerp(zA, zR, t);
    // Runs up the pillar and ends tucked under the roof, so the cross bar sits at the screen header.
    const y = t < 1 ? Math.max(0.8, (z <= p.z.sideFront ? cv.railY(z) : cv.glassBaseY(z)) - 0.06) : cv.topY(z) - 0.05;
    return new THREE.Vector3(s * (t < 1 ? inner(z, y) - 0.02 : cv.railX(z) - 0.13), y, z);
  });
  parts.push(tube([...pillar(-1), ...pillar(1).reverse()], r, colour, d));
  for (const s of [-1, 1]) {
    // Halo bars along the roof edge, rear stays, door bars (an X on the driver's side).
    parts.push(tube([top(zR, s), top((zR + zHoop) / 2, s), top(zHoop, s)], r, colour, d));
    parts.push(tube([top(zHoop, s), new THREE.Vector3(s * 0.55, 0.5, zHoop - 0.9)], r * 0.9, colour, d));
    const lo = (z: number, y: number) => new THREE.Vector3(s * inner(z, y), y, z);
    parts.push(tube([lo(zA - 0.05, 0.62), lo(zHoop + 0.02, 0.36)], r, colour, d));
    if (s < 0) {
      parts.push(tube([lo(zA - 0.05, 0.36), lo(zHoop + 0.02, 0.62)], r, colour, d));
      parts.push(tube([lo(zA - 0.05, 0.5), lo(zHoop + 0.02, 0.5)], r, colour, d));
    }
  }
  parts.push(tube([top(zHoop, 1), new THREE.Vector3(-inner(zHoop, 0.3), 0.3, zHoop)], r, colour, d));
  return merge(parts);
}
