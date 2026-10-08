// Tyre heat input shared by the fixed-step physics and the HUD harness, in
// C/s of carcass temperature, from four mechanisms weighted by each tyre's
// share of the vertical load:
//  - cornering: lateral force is shared by load, so the outside tyres run
//    hotter; the fronts slightly more (larger slip angles, mild understeer);
//  - braking: 60 % front bias split across each axle by load (the load moves
//    forward under braking), plus brake-disc heat soaking into the wheels;
//  - traction: rears only; strong out of slow corners, small on fast straights;
//  - sliding: friction work past the peak (slip angle, lock-up, wheelspin). It is
//    bounded by a fully sliding patch (0.86 mu Fz at road speed), so a 300x
//    lock-up demand heats no more than any other locked wheel.
// Constants were fitted to five autopilot laps of the real physics.
import { SLIDING_FRICTION, USE_PER_RAD } from '@/physics/tyre';

export interface TyreHeatInput {
  throttle: number; brake: number; steer: number; gLat?: number; gLong?: number;
  /** `slide`: the physics' friction-work fraction (WheelTelemetry); estimated from `slip` without it. */
  wheels?: ReadonlyArray<{ load: number; slip: number; slide?: number }>;
}

const LAT_K = 0.0128;
const FRONT_LAT = 1.1;
/** How strongly a tyre's load share scales its cornering heat (1 = proportional). */
const LOAD_EXP = 0.35;
const BRAKE_K = 0.022;
/** CAR_SPECS brakeBiasFront (both cars). */
const BRAKE_BIAS_FRONT = 0.6;
const DISC_K = 0.05;
const TRACTION_K = 0.08;
const SLIDE_K = 0.5;
/** Fallback load model (no wheel telemetry): static front share and transfer per g. */
const STATIC_FRONT = 0.52;
const LAT_TRANSFER = 0.085;
const LONG_TRANSFER = 0.055;
const G = 9.81;
const WHEELBASE_M = 2.82;
const MAX_STEER_RAD = 0.36;
/** Cap for the steer-based lateral g estimate (about the grip limit). */
const MAX_EST_G = 2.2;
/** Tyre order FL, FR, RL, RR (matches the car model's WheelIndex). */
const IS_FRONT = [true, true, false, false];
const IS_RIGHT = [false, true, false, true];



/** Friction work past the peak (fraction of mu Fz v); without telemetry, read slip use past 1 as slip angle. */
function slideFraction(w: { slip: number; slide?: number }): number {
  const f = w.slide ?? (w.slip - 1) / USE_PER_RAD;
  return Math.max(0, Math.min(SLIDING_FRICTION, Number.isFinite(f) ? f : 0));
}

/** Lateral g (+ = left turn): telemetry, else a bicycle-model estimate from steer and speed. */
function lateralG(st: TyreHeatInput, v: number): number {
  if (st.gLat !== undefined) return st.gLat;
  return Math.max(-MAX_EST_G, Math.min(MAX_EST_G, (v * v * Math.tan(st.steer * MAX_STEER_RAD)) / WHEELBASE_M / G));
}

/** Each tyre's share of the total vertical load (sums to 1): telemetry, else g-force transfer. */
export function loadShares(st: TyreHeatInput, gLat: number, gLong: number, out: number[]): number[] {
  const w = st.wheels;
  const total = w && w.length === 4 ? w[0].load + w[1].load + w[2].load + w[3].load : 0;
  if (w && total > 1) {
    for (let i = 0; i < 4; i++) out[i] = Math.max(0, w[i].load) / total;
    return out;
  }
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const base = (IS_FRONT[i] ? STATIC_FRONT : 1 - STATIC_FRONT) / 2;
    const side = (IS_RIGHT[i] ? 1 : -1) * gLat * LAT_TRANSFER;
    const pitch = (IS_FRONT[i] ? 1 : -1) * -gLong * LONG_TRANSFER;
    out[i] = Math.max(0.03, base + side + pitch);
    sum += out[i];
  }
  for (let i = 0; i < 4; i++) out[i] /= sum;
  return out;
}

/** Heat input (C/s) for each tyre, FL, FR, RL, RR, written into `out`. */
export function tyreHeat(st: TyreHeatInput, v: number, out: number[]): number[] {
  const gLat = lateralG(st, v);
  const gLong = st.gLong ?? st.throttle * 0.45 - st.brake * 2.1;
  const sh = loadShares(st, gLat, gLong, out);
  const frontLoad = sh[0] + sh[1] || 1;
  const rearLoad = sh[2] + sh[3] || 1;
  const gBrake = st.brake > 0.02 ? Math.max(0, -gLong) : 0;
  const gDrive = st.throttle > 0.05 ? Math.max(0, gLong) : 0;
  const w = st.wheels && st.wheels.length === 4 ? st.wheels : null;
  for (let i = 0; i < 4; i++) {
    const front = IS_FRONT[i];
    const s = Math.max(0.04, sh[i]);
    const corner = LAT_K * (front ? FRONT_LAT : 1) * Math.pow(4 * s, LOAD_EXP) * gLat * gLat * v;
    const bias = front ? BRAKE_BIAS_FRONT : 1 - BRAKE_BIAS_FRONT;
    const brakeShare = (bias * sh[i]) / (front ? frontLoad : rearLoad);
    const brake = BRAKE_K * 4 * brakeShare * gBrake * v + DISC_K * st.brake * v * (bias / 2);
    const driveShare = front ? 0 : (0.5 * sh[i]) / rearLoad;
    const traction = (TRACTION_K * (driveShare * gDrive) ** 2 * v) / s;
    const slide = w ? SLIDE_K * slideFraction(w[i]) * 4 * s * v : 0;
    out[i] = corner + brake + traction + slide;
  }
  return out;
}
