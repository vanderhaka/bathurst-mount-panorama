import type { TyreResult } from '@/physics/tyre';

export interface BrakeContact { powerW: number; lockUse: number }

/** Uses the existing tyre solver's longitudinal lock branch, never its combined cornering slip. */
export function brakeContact(
  loadN: number, mu: number, speed: number, driveForceN: number, brakeForceN: number,
  result: Pick<TyreResult, 'fx' | 'absActive'>, out: BrakeContact = { powerW: 0, lockUse: 0 },
): BrakeContact {
  out.powerW = out.lockUse = 0;
  if (!Number.isFinite(loadN + mu + speed + driveForceN + brakeForceN + result.fx)) return out;
  if (loadN <= 0 || mu <= 0 || Math.abs(speed) <= 0.05 || brakeForceN <= 0) return out;
  const direction = Math.sign(speed), limit = loadN * mu;
  const demand = Math.abs(driveForceN - direction * brakeForceN) / limit;
  // tyreForces treats demand>1 without ABS as a locked/spinning wheel. Only braking counts here.
  if (!result.absActive && brakeForceN > Math.abs(driveForceN) && demand > 1) {
    out.lockUse = demand;
    // Once locked, the disc is stationary; the remaining road work heats/wears the tyre.
    return out;
  }
  const delivered = Math.max(0, Math.min(brakeForceN, direction * (driveForceN - result.fx)));
  out.powerW = delivered * Math.abs(speed);
  return out;
}
