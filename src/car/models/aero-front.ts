// Front and side aero/trim: splitter, side skirts with side-exit exhausts,
// door mirrors and the windscreen wiper.
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
  splitter: THREE.BufferGeometry;
  splitterHinge: THREE.Vector3;
}

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function splitter(p: BodyProfile, dims: CarDimensions): { geo: THREE.BufferGeometry; hinge: THREE.Vector3 } {
  const face = makeCurve(p.nose.face);
  const zTip = face(0.1) + p.splitter.reach;
  const sweep = (x: number) => p.nose.sweep * Math.pow(Math.min(1, Math.abs(x)), p.nose.sweepPow);
  const zBack = dims.wheelbase / 2 + 0.36;
  const half = 0.93;
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= 14; i++) {
    const x = -half + (2 * half * i) / 14;
    pts.push([x, zTip - sweep(x) - (Math.abs(x) > 0.86 ? (Math.abs(x) - 0.86) * 0.8 : 0)]);
  }
  pts.push([half - 0.02, zBack], [-half + 0.02, zBack]);
  const t = p.splitter.thickness;
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

function mirrors(p: BodyProfile, cv: CurveSet, housing: number): { plastic: THREE.BufferGeometry[]; trim: THREE.BufferGeometry[] } {
  const z = p.mirror.z;
  const y = p.mirror.y;
  const x0 = cv.glassBaseX(z);
  const plastic: THREE.BufferGeometry[] = [];
  const trim: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const cx = x0 + 0.115;
    const sections = [0.07, 0.048, 0.015, -0.022, -0.03].map((dz, i) => {
      const k = [0.35, 0.8, 1, 1, 0.97][i];
      return ringSection(new THREE.Vector3(s * cx, y + 0.05, z + dz), X, Y, 0.075 * k, 0.046 * k, 12, 3.2);
    });
    trim.push(tint(loft(sections, true, false), housing));
    const glass = ringSection(new THREE.Vector3(s * cx, y + 0.05, z - 0.031), X, Y, 0.068, 0.039, 12, 3.2);
    // Door-mirror glass: dark with a slight sky tint.
    trim.push(tint(loft([glass, glass.map((v) => v.clone().setZ(v.z - 0.001))], true, false), 0x3b4b5e));
    // Stalk from the door top (outside the side glass) up to the housing.
    const base = new THREE.Vector3(s * (x0 + 0.035), cv.glassBaseY(z) - 0.012, z + 0.01);
    const tip = new THREE.Vector3(s * (cx - 0.03), y + 0.028, z);
    const stalk = loft([base, tip].map((c) => ringSection(c, Y, Z, 0.01, 0.026, 6, 2)), true, true);
    plastic.push(stalk);
  }
  return { plastic, trim };
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
  const sp = splitter(p, dims);
  const m = mirrors(p, cv, housing);
  const w = wiper(grid, p);
  return {
    plastic: [...skirts(p, cv, dims), ...m.plastic, ...(w ? [w] : [])],
    trim: [...exhausts(p, cv), ...m.trim],
    splitter: sp.geo,
    splitterHinge: sp.hinge,
  };
}

