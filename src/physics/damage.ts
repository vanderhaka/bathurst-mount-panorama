import type { DamageState, ImpactReport } from '@/physics/types';
import type { Vehicle } from '@/physics/vehicle';

export function createDamage(): DamageState {
  return { front: 0, rear: 0, left: 0, right: 0, engine: 0, suspension: 0, aero: 0 };
}

/** Severity 0..1 of an impact from its normal speed (m/s). 3 m/s = scrape, 25+ m/s = huge crash. */
export function impactSeverity(speed: number): number {
  return Math.max(0, Math.min(1, (speed - 2) / 24));
}

/** Converts the impact point to car-local coordinates: [x lateral (+ left), z longitudinal (+ forward)]. */
export function impactLocal(v: Vehicle, imp: ImpactReport): [number, number] {
  const dx = imp.x - v.x, dz = imp.z - v.z;
  const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
  return [dx * cos - dz * sin, dx * sin + dz * cos];
}

/** Accumulates mechanical damage per zone from one impact. */
export function applyImpactDamage(v: Vehicle, imp: ImpactReport): void {
  const sev = impactSeverity(imp.speed);
  if (sev <= 0) return;
  const d = v.damage;
  const [lx, lz] = impactLocal(v, imp);
  const half = v.spec.dimensions.length / 2;
  const add = (k: keyof DamageState, amount: number) => { d[k] = Math.min(1, d[k] + amount); };
  if (lz > half * 0.45) {
    add('front', sev * 0.9);
    add('aero', sev * 0.6);
    if (sev > 0.25) add('engine', (sev - 0.25) * 0.8);
  } else if (lz < -half * 0.45) {
    add('rear', sev * 0.9);
    add('aero', sev * 0.5);
  }
  if (lx > 0.3) add('left', sev * 0.8);
  if (lx < -0.3) add('right', sev * 0.8);
  // Hits near a wheel bend the suspension.
  const nearAxle = Math.abs(Math.abs(lz) - v.spec.dimensions.wheelbase / 2) < 0.7;
  if (nearAxle && Math.abs(lx) > 0.5) add('suspension', sev * 0.7);
}
