import type { CarSpec, WheelGrip } from '@/car/car-specs';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';

const G = 9.81;
const RHO = 1.2;

export interface SpeedProfile {
  /** Target speed per sample along the racing line (m/s). */
  speed: Float32Array;
  /** Pure cornering limit per sample (m/s) before acceleration/braking passes. */
  cornerLimit: Float32Array;
  /** Predicted lap time on the racing line (s). */
  lapTimeS: number;
  topSpeed: number;
}

export interface ProfileOptions {
  /** Fraction of the theoretical grip used (driver/safety margin). */
  gripFactor: number;
  /** Max speed cap (m/s). */
  vMax: number;
  /**
   * Exponent on the friction-ellipse factor for braking in a corner. 1 is the
   * ideal; a careful driver (2) brakes earlier and more in a straight line,
   * because heavy braking at high lateral g unloads the inside rear tyre.
   */
  trailBrakeExp: number;
  /**
   * Corner on the weaker axle's grip (spec.wheelGrip) instead of the mean of all four tyres. With more
   * rear grip the car understeers at the front's limit, and a hot outside front tyre limits every corner
   * that loads it; a mean promises cornering speed the car cannot hold.
   */
  limitingAxle: boolean;
}

/**
 * Profile behind the racing-line colours and the HUD next-corner speed: what a
 * driver can really hold, not the theoretical limit. A driver who brakes on red,
 * lifts on yellow and accelerates on green laps cleanly (tests/line-follower.test.ts).
 */
export const LINE_PROFILE: Partial<ProfileOptions> = { gripFactor: 0.92, trailBrakeExp: 2, limitingAxle: true };

/** Quasi-steady-state lap simulation: cornering limit, then forward (power) and backward (brakes) passes. */
export function computeSpeedProfile(track: Track, line: RacingLine, spec: CarSpec, opts: Partial<ProfileOptions> = {}): SpeedProfile {
  const n = track.n;
  const grip = opts.gripFactor ?? 0.97;
  const vMax = opts.vMax ?? 95;
  const trailExp = opts.trailBrakeExp ?? 1;
  const m = spec.massKg;
  const mu = spec.tyreMu * grip;
  // Curvature + = left turn, where the right-hand tyres are on the outside.
  const muLeft = mu * (opts.limitingAxle ? turnGrip(spec.wheelGrip, 1) : 1);
  const muRight = mu * (opts.limitingAxle ? turnGrip(spec.wheelGrip, 0) : 1);
  const muTurn = (i: number) => (line.curvature[i] >= 0 ? muLeft : muRight);
  const kAero = 0.5 * RHO * spec.clA; // downforce = kAero v^2
  const kDrag = 0.5 * RHO * spec.cdA;
  const peakPower = enginePeakPowerW(spec);
  const powerW = peakPower * spec.drivetrainEfficiency * 0.92; // gearing losses: not always at peak
  const vertK = verticalCurvature(track);

  const limit = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(line.curvature[i]);
    const muCorner = muTurn(i);
    // Crossfall: + helps (road rises to the outside), - is off-camber. bank + = left side higher,
    // curvature + = left turn, so a left turn is helped by the right side being higher.
    const help = -track.bank[i] * Math.sign(line.curvature[i]);
    const muB = Math.max(0.2, (muCorner + help) / (1 - muCorner * help));
    // Normal load per unit mass: g * cos(grade) - v^2 * kv (crests unload the car).
    // Solve m v^2 k = muB (m (g - v^2 kv) + kAero v^2) for v.
    const denom = m * k - muB * kAero + muB * m * Math.max(-0.02, vertK[i]);
    limit[i] = denom <= 1e-6 ? vMax : Math.min(vMax, Math.sqrt((muB * m * G) / denom));
  }
  const v = Float32Array.from(limit);
  const lateralUse = (i: number, vv: number) => {
    const aLat = vv * vv * Math.abs(line.curvature[i]);
    const aMax = (muTurn(i) * (m * (G - vv * vv * Math.max(0, vertK[i])) + kAero * vv * vv)) / m;
    return Math.min(1, aLat / Math.max(0.1, aMax));
  };
  // Two laps of passes so that the wrap-around point converges.
  for (let pass = 0; pass < 2; pass++) {
    for (let k = 0; k < n; k++) {
      const i = k, j = (k + 1) % n;
      const vi = v[i];
      const normal = m * G + kAero * vi * vi;
      const ellipse = Math.sqrt(Math.max(0, 1 - lateralUse(i, vi) ** 2));
      const traction = mu * normal * (1 - spec.frontWeight) * ellipse * 1.15;
      const drive = Math.min(traction, powerW / Math.max(vi, 3));
      const a = (drive - kDrag * vi * vi) / m - G * track.grade[i];
      const vNext = Math.sqrt(Math.max(0, vi * vi + 2 * a * line.ds[i]));
      if (vNext < v[j]) v[j] = vNext;
    }
    for (let k = n - 1; k >= 0; k--) {
      const i = k, j = (k + 1) % n;
      const vj = v[j];
      const normal = m * G + kAero * vj * vj;
      const ellipse = Math.sqrt(Math.max(0, 1 - lateralUse(j, vj) ** 2));
      const brake = mu * normal * ellipse ** trailExp * 0.88;
      const a = (brake + kDrag * vj * vj) / m + G * track.grade[i];
      const vPrev = Math.sqrt(Math.max(0, vj * vj + 2 * a * line.ds[i]));
      if (vPrev < v[i]) v[i] = vPrev;
    }
  }
  let t = 0, top = 0;
  for (let i = 0; i < n; i++) {
    t += line.ds[i] / Math.max(1, (v[i] + v[(i + 1) % n]) / 2);
    top = Math.max(top, v[i]);
  }
  return { speed: v, cornerLimit: limit, lapTimeS: t, topSpeed: top };
}

/**
 * Grip of the weaker axle in a turn, relative to tyreMu. The outside tyre carries at least half of its
 * axle's load (all of it once the inside wheel lifts), so an axle holds at least min(outside, axle mean).
 */
function turnGrip(wheel: WheelGrip | undefined, outside: 0 | 1): number {
  if (!wheel) return 1;
  const axle = (o: number, i: number) => Math.min(o, (o + i) / 2);
  return Math.min(axle(wheel[outside], wheel[1 - outside]), axle(wheel[2 + outside], wheel[3 - outside]));
}

/** Peak engine power from the torque curve (W). */
export function enginePeakPowerW(spec: CarSpec): number {
  let best = 0;
  for (const [rpm, nm] of spec.engine.torqueCurve) best = Math.max(best, (nm * rpm * 2 * Math.PI) / 60);
  return best;
}

/** Vertical curvature of the centreline (1/m, + = crest), smoothed. */
function verticalCurvature(track: Track): Float32Array {
  const n = track.n;
  const out = new Float32Array(n);
  const h = 5;
  for (let i = 0; i < n; i++) {
    const a = track.py[(i - h + n) % n], b = track.py[i], c = track.py[(i + h) % n];
    const ds = h * track.spacing;
    out[i] = -(a - 2 * b + c) / (ds * ds);
  }
  return out;
}
