// Front and side aero/trim: splitter, side skirts with side-exit exhausts,
// door mirrors, the roof aerial and the windscreen wiper.
import * as THREE from 'three';
import type { CarDimensions } from '@/car/car-specs';
import { makeCurve } from '@/car/models/curves';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyGrid } from '@/car/models/body-grid';
import { makeProbe } from '@/car/models/body-probe';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, loft, merge, ringSection, tint } from '@/car/models/geo-utils';

export interface FrontAero {
  plastic: THREE.BufferGeometry[];
  trim: THREE.BufferGeometry[];
  splitter: THREE.BufferGeometry | null;
  splitterHinge: THREE.Vector3 | null;
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function splitter(p: BodyProfile, dims: CarDimensions): { geo: THREE.BufferGeometry; hinge: THREE.Vector3 } | null {
  const sp = p.splitter;
  if (!sp) return null;
  const face = makeCurve(p.nose.face);
  const zTip = face(0.1) + sp.reach;
  const sweep = (x: number) => p.nose.sweep * Math.pow(Math.min(1, Math.abs(x)), p.nose.sweepPow);
  const zBack = dims.wheelbase / 2 + 0.36;
  const half = 0.93;
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= 14; i++) {
    const x = -half + (2 * half * i) / 14;
    pts.push([x, zTip - sweep(x) - (Math.abs(x) > 0.86 ? (Math.abs(x) - 0.86) * 0.8 : 0)]);
  }
  pts.push([half - 0.02, zBack], [-half + 0.02, zBack]);
  const t = sp.thickness;
  const plate = extrude(pts, t, (a, b, d) => [a, 0.062 + d, b]);
  // Upright fences at the splitter ends, so the lip reads from the side.
  const zEnd = zTip - sweep(half) - 0.07;
  const fences = [1, -1].map((s) => extrude([[zBack + 0.25, 0.062 + t], [zEnd, 0.062 + t], [zEnd - 0.04, 0.175], [zBack + 0.3, 0.2]], 0.012, (a, b, d) => [s * (half - 0.03) - d * s, b, a]));
  return { geo: merge([plate, ...fences]), hinge: new THREE.Vector3(0, 0.062 + t / 2, zBack) };
}

function skirts(p: BodyProfile, cv: CurveSet, dims: CarDimensions): THREE.BufferGeometry[] {
  const R = p.arch.radius;
  const z0 = -dims.wheelbase / 2 + R + 0.015;
  const z1 = dims.wheelbase / 2 - R - 0.015;
  const out: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const sections = [z0, (z0 + z1) / 2, z1].map((z) => {
      const sx = cv.sillX(z);
      return [[sx - 0.03, 0.135], [sx + 0.008, 0.13], [sx + 0.02, 0.082], [sx - 0.03, 0.074]].map(([x, y]) => new THREE.Vector3(s * x, y, z));
    });
    out.push(loft(sections, true, true));
  }
  return out;
}

function exhausts(p: BodyProfile, cv: CurveSet): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const sx = cv.sillX(p.exhaustZ);
  for (const s of [1, -1]) {
    for (const dz of [-0.055, 0.055]) {
      const c = (x: number) => new THREE.Vector3(s * x, 0.108, p.exhaustZ + dz);
      const tube = loft([sx - 0.05, sx + 0.012, sx + 0.03].map((x, i) => ringSection(c(x), Z, Y, 0.05 - i * 0.002, 0.032, 10, 2.4)), true, false);
      out.push(tint(tube, 0x6e655c));
    }
    const plate = extrude([[p.exhaustZ - 0.13, 0.075], [p.exhaustZ + 0.13, 0.075], [p.exhaustZ + 0.11, 0.142], [p.exhaustZ - 0.11, 0.142]], 0.006, (a, b, d) => [s * (sx + 0.022 + d), b, a]);
    out.push(tint(plate, 0x3a3a3c));
  }
  return out;
}

/** Door mirrors: a teardrop housing in the livery colour, a black bezel and a dark reflective glass face. */
function mirrors(p: BodyProfile, cv: CurveSet, housing: number): { plastic: THREE.BufferGeometry[]; trim: THREE.BufferGeometry[] } {
  const z = p.mirror.z;
  const y = p.mirror.y;
  const x0 = cv.glassBaseX(z);
  const plastic: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const cx = x0 + 0.115;
    const c = (dz: number, dy = 0) => new THREE.Vector3(s * cx, y + 0.05 + dy, z + dz);
    // Housing: pointed nose, full section over the glass, slight taper towards the open back.
    const sections = [0.085, 0.06, 0.03, 0.0, -0.024, -0.03].map((dz, i) => {
      const k = [0.3, 0.72, 0.96, 1, 1, 0.98][i];
      return ringSection(c(dz, (1 - k) * 0.01), X, Y, 0.078 * k, 0.048 * k, 12, 3.2);
    });
    trim.push(tint(loft(sections, true, false), housing));
    // Black bezel ring recessed into the back of the housing, then the glass inside it.
    const bezel = [-0.03, -0.034].map((dz) => ringSection(c(dz), X, Y, 0.07, 0.041, 12, 3.2));
    trim.push(tint(loft(bezel, false, true), 0x0d0e10));
    const glass = ringSection(c(-0.0335), X, Y, 0.063, 0.035, 12, 3.2);
    trim.push(tint(loft([glass, glass.map((v) => v.clone().setZ(v.z - 0.001))], true, false), 0x26303c));
    // Stalk from the door top (outside the side glass) up to the housing.
    const base = new THREE.Vector3(s * (x0 + 0.035), cv.glassBaseY(z) - 0.012, z + 0.01);
    const tip = new THREE.Vector3(s * (cx - 0.03), y + 0.028, z);
    const stalk = loft([base, tip].map((v) => ringSection(v, Y, Z, 0.01, 0.026, 6, 2)), true, true);
    plastic.push(stalk);
  }
  return { plastic, trim };
}

/** Roof aerial: a short whip on a puck at the rear centre of the roof. */
function aerial(p: BodyProfile, cv: CurveSet): THREE.BufferGeometry {
  const z = p.z.roofRear + 0.08;
  const yTop = cv.topY(z);
  const puck = new THREE.CylinderGeometry(0.02, 0.026, 0.02, 8).translate(0, yTop + 0.006, z);
  const whip = new THREE.CylinderGeometry(0.003, 0.006, 0.3, 5).rotateX(0.08).translate(0, yTop + 0.16, z);
  return merge([puck, whip]);
}

function wiper(grid: BodyGrid, p: BodyProfile): THREE.BufferGeometry | null {
  const probe = makeProbe(grid, grid.rowAt.roofFront, grid.rowAt.cowl + 1);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const x = -0.05 + t * 0.62;
    const z = p.z.cowl - 0.06 - t * 0.06;
    const hit = probe.cast(new THREE.Vector3(x, 3, z), new THREE.Vector3(0, -1, 0));
    if (hit) pts.push(hit.point.addScaledVector(hit.normal, 0.014));
  }
  probe.dispose();
  if (pts.length < 2) return null;
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.008, 5, false);
}

export function buildFrontAero(grid: BodyGrid, p: BodyProfile, cv: CurveSet, dims: CarDimensions, housing: number): FrontAero {
  const spl = splitter(p, dims);
  const m = mirrors(p, cv, p.mirror.colour ?? housing);
  const w = wiper(grid, p);
  return {
    // The roof aerial is a Gen3 fitting; the classic car goes without.
    plastic: [...(p.sideSkirts === false ? [] : skirts(p, cv, dims)), ...m.plastic, ...(p.cockpit === 'classic' ? [] : [aerial(p, cv)]), ...(w ? [w] : [])],
    trim: [...exhausts(p, cv), ...m.trim],
    splitter: spl?.geo ?? null,
    splitterHinge: spl?.hinge ?? null,
  };
}

