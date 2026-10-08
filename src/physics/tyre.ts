import type { SurfaceKind } from '@/track/track-query';

/** Grip multiplier, rolling-drag coefficient (fraction of load) and bump amplitude per surface. */
export const SURFACE: Record<SurfaceKind, { grip: number; drag: number; bump: number }> = {
  road: { grip: 1, drag: 0.012, bump: 0 },
  kerb: { grip: 0.9, drag: 0.02, bump: 0.005 },
  asphalt: { grip: 0.92, drag: 0.015, bump: 0 },
  concrete: { grip: 0.85, drag: 0.015, bump: 0 },
  grass: { grip: 0.52, drag: 0.07, bump: 0.003 },
  gravel: { grip: 0.42, drag: 0.42, bump: 0.008 },
};

/** Fraction of the friction limit that ABS / TC allow for braking / drive. */
export const ABS_USE = 0.95;
export const TC_USE = 0.95;
/** Exponent of the combined-slip super-ellipse (2 = friction circle; real tyres are closer to 2.5). */
const COMBINED_P = 2.4;
/** Friction left to a locked or spinning tyre, as a fraction of the peak. */
export const SLIDING_FRICTION = 0.86;
/** Combined-slip use added per radian of slip angle past the peak. */
export const USE_PER_RAD = 4;

/** Shape of the lateral force curve (Pacejka B and C) and the slip angle of its peak (rad). */
export interface TyreCurve { b: number; c: number; peak: number; slide: number }

/**
 * Curve with its peak at `peakSlip` (rad) that falls to `slideGrip` (fraction of the
 * peak) in a full slide: sin(C * pi / 2) = slideGrip, and C * atan(B * peak) = pi / 2.
 */
export function makeTyreCurve(peakSlip: number, slideGrip: number): TyreCurve {
  const c = 2 - (2 * Math.asin(Math.min(0.99, Math.max(0.05, slideGrip)))) / Math.PI;
  return { b: Math.tan(Math.PI / (2 * c)) / peakSlip, c, peak: peakSlip, slide: slideGrip };
}

/** Warm slicks: peak at 6.3 degrees, 59 % of the peak left in a full slide (the measured car). */
export const DEFAULT_CURVE: TyreCurve = makeTyreCurve((6.3 * Math.PI) / 180, 0.59);

let lastCurve = DEFAULT_CURVE;
/** makeTyreCurve with a one-entry cache (the physics asks every step with the same values). */
export function tyreCurve(peakSlip: number, slideGrip: number): TyreCurve {
  if (lastCurve.peak !== peakSlip || lastCurve.slide !== slideGrip) lastCurve = makeTyreCurve(peakSlip, slideGrip);
  return lastCurve;
}

/** Normalised lateral force (0..1, can fall below peak past the limit) for a slip angle. Pacejka-style. */
export function lateralCurve(alpha: number, k: TyreCurve = DEFAULT_CURVE): number {
  return Math.sin(k.c * Math.atan(k.b * Math.abs(alpha)));
}

export interface TyreResult {
  /** Force along the wheel heading (N, + = forward). */
  fx: number;
  /** Force across the wheel (N, + = to the wheel's left). */
  fy: number;
  /** Combined-slip use (0..1, >1 = sliding). */
  use: number;
  /**
   * Friction work past the peak as a fraction of mu * Fz * road speed: 0 while the tyre grips,
   * SLIDING_FRICTION when the whole patch slides (locked or spinning). Bounded however hard
   * the brake or throttle asks.
   */
  slide: number;
  absActive: boolean;
  tcActive: boolean;
}

/**
 * Combined tyre forces on one wheel from a requested longitudinal force and the
 * slip angle. Friction ellipse; locked or spinning wheels lose most lateral grip.
 * u = wheel-frame forward speed, w = wheel-frame lateral speed.
 */
export function tyreForces(
  fz: number, mu: number, u: number, w: number,
  driveForce: number, brakeForce: number,
  abs: boolean, tc: boolean, massShare: number, dt: number,
  out: TyreResult, curve: TyreCurve = DEFAULT_CURVE,
): TyreResult {
  out.absActive = false;
  out.tcActive = false;
  if (fz <= 0) {
    out.fx = 0; out.fy = 0; out.use = 0; out.slide = 0;
    return out;
  }
  const limit = mu * fz;
  const alpha = Math.atan2(w, Math.max(Math.abs(u), 4));
  let fy = -Math.sign(alpha) * limit * lateralCurve(alpha, curve);
  // Do not overshoot past zero lateral speed in one step (low-speed stability).
  const maxStop = (massShare * Math.abs(w)) / dt;
  if (Math.abs(fy) > maxStop) fy = Math.sign(fy) * maxStop;

  // Brake force opposes travel; at standstill it only holds.
  const dir = Math.abs(u) > 0.05 ? Math.sign(u) : 0;
  let brake = brakeForce;
  if (dir === 0) brake = Math.min(brake, (massShare * Math.abs(u)) / dt);
  let fx = driveForce - dir * brake;
  // Longitudinal room left by the current lateral force (super-ellipse).
  const latUse = Math.min(1, Math.abs(fy) / limit);
  const roomX = limit * Math.pow(1 - Math.pow(latUse, COMBINED_P), 1 / COMBINED_P);
  const braking = brake > Math.abs(driveForce);
  // Assists give the lateral force priority, like real ABS / traction control.
  if (abs && braking && Math.abs(fx) > Math.max(roomX, limit * 0.35) * ABS_USE) {
    fx = Math.sign(fx) * Math.max(roomX, limit * 0.35) * ABS_USE;
    out.absActive = true;
  } else if (tc && !braking && fx > Math.max(roomX, limit * 0.15 * (1 - latUse)) * TC_USE) {
    // A small floor keeps the car moving off the line; none when the tyre is at its lateral limit.
    fx = Math.max(roomX, limit * 0.15 * (1 - latUse)) * TC_USE;
    out.tcActive = true;
  } else if (tc && !braking && fx < -roomX * TC_USE) {
    // Overrun (engine braking) control: a lift at the limit must not unsettle the rear.
    fx = -roomX * TC_USE;
    out.tcActive = true;
  }
  const use = Math.abs(fx) / limit;
  if (use > 1) {
    // Locked or spinning: sliding friction, little lateral grip left.
    fx = Math.sign(fx) * limit * SLIDING_FRICTION;
    fy *= 0.32;
    out.fx = fx; out.fy = fy; out.use = use; out.slide = SLIDING_FRICTION;
    return out;
  }
  const latRoom = Math.pow(Math.max(0, 1 - Math.pow(use, COMBINED_P)), 1 / COMBINED_P);
  if (Math.abs(fy) > limit * latRoom) fy = Math.sign(fy) * limit * latRoom;
  out.fx = fx;
  out.fy = fy;
  out.use = Math.hypot(fx, fy) / limit + Math.max(0, Math.abs(alpha) - curve.peak) * USE_PER_RAD;
  // Lateral slip speed beyond the peak's, per unit road speed, times the force doing the work.
  out.slide = (Math.abs(fy) / limit) * Math.max(0, Math.sin(Math.abs(alpha)) - Math.sin(curve.peak));
  return out;
}
