import type { CarSpec } from '@/car/car-specs';
import type { CarSetup } from '@/config/setup';

/** Corner geometry and existing spring/damper parameters, measured from the CG. */
export interface SuspensionCorner { x: number; z: number; k: number; c: number; h0: number }

export function suspensionCorners(spec: CarSpec, a: number, b: number): SuspensionCorner[] {
  const d = spec.dimensions, G = 9.81;
  const mg = spec.massKg * G;
  const loadF = mg * spec.frontWeight / 2, loadR = mg * (1 - spec.frontWeight) / 2;
  const mk = (x: number, z: number, k: number, load: number): SuspensionCorner => ({ x, z, k, c: 2 * 0.5 * Math.sqrt(k * (load / G)), h0: spec.cgHeight + load / k });
  return [mk(d.trackFront / 2, a, 125000, loadF), mk(-d.trackFront / 2, a, 125000, loadF), mk(d.trackRear / 2, -b, 112000, loadR), mk(-d.trackRear / 2, -b, 112000, loadR)];
}

/** Spring, blow-off damper, bump stop and bar: the default reproduces the existing forces. */
export function suspensionForce(c: SuspensionCorner, comp: number, previous: number, opposite: number, cgHeight: number, arb: number, dt: number): number {
  const rate = (comp - previous) / dt;
  const staticComp = c.h0 - cgHeight;
  const damper = Math.max(-9000, Math.min(14000, c.c * rate));
  let force = comp > 0 ? c.k * comp + damper : 0;
  if (comp > staticComp + 0.07) force += (comp - staticComp - 0.07) * 900000;
  if (comp > 0) force += arb * (comp - opposite) * 0.5;
  return Math.max(0, force);
}

/** Estimated pressure response: modest grip loss away from 150 kPa; exactly 1 at the default. */
export function pressureGrip(kpa: number): number {
  const deviation = (Math.max(120, Math.min(180, kpa)) - 150) / 30;
  return 1 - 0.08 * deviation * deviation;
}

/** Mean pressure grip for the existing approximate racing-line speed profile. */
export function setupSpec(spec: CarSpec, setup: Readonly<CarSetup>): CarSpec {
  return { ...spec, tyreMu: spec.tyreMu * (pressureGrip(setup.frontPressureKpa) + pressureGrip(setup.rearPressureKpa)) / 2 };
}
