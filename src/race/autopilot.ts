import { tyreCurve } from '@/physics/tyre';
import type { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import type { RacingLine } from '@/track/racing-line';
import type { ProfileOptions, SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';

/**
 * Speed-profile options for the AI: 90 % of the grip (clean at 93 %, crashes at
 * 96 % in the full-lap sweep) and straight-line-biased braking.
 */
export const AI_PROFILE: Partial<ProfileOptions> = { gripFactor: 0.9, trailBrakeExp: 2 };

/**
 * Steady-state body slip, in rad per m/s^2 of the line's lateral acceleration: the rear tyres run at
 * a slip angle, so the body points into the corner and the heading error alone steers out. Capped at
 * 2 m x curvature, the heading preview the controller used to get from its nearest 4 m sample.
 */
const BODY_SLIP_PER_ACC = 0.0005;
const BODY_SLIP_MAX_M = 2;
const G = 9.81;
const RHO = 1.2;
const tangent: [number, number] = [0, 0];

/** Unit tangent of the line at sample i (central difference), written into `tangent`. */
function lineTangent(line: RacingLine, i: number, n: number): [number, number] {
  const dx = line.x[(i + 1) % n] - line.x[(i - 1 + n) % n], dz = line.z[(i + 1) % n] - line.z[(i - 1 + n) % n];
  const len = Math.hypot(dx, dz) || 1;
  tangent[0] = dx / len;
  tangent[1] = dz / len;
  return tangent;
}

/**
 * Steering feed-forward for the line curvature `kappa` at speed `v1`. The heading error, measured at the
 * front axle against the body, already carries the kinematic wheelbase x curvature steer, so the
 * curvature term may add at most the front slip angle the corner's lateral grip use needs; on a 13 m
 * hairpin the uncapped term asked for twice that and held the car 1 m inside its line.
 */
function feedForward(v: Vehicle, kappa: number, v1: number): number {
  const h = v.handling, curve = tyreCurve((h.peakSlipDeg * Math.PI) / 180, h.slideGrip);
  const latMax = v.spec.tyreMu * h.grip * (G + (0.5 * RHO * v.spec.clA * h.downforce * v1 * v1) / v.massKg);
  const use = Math.min(1, (v1 * v1 * Math.abs(kappa)) / latMax);
  const frontSlip = Math.tan(Math.asin(use) / curve.c) / curve.b;
  const curvature = Math.abs(kappa) * v.spec.dimensions.wheelbase * (1 + 0.15 * Math.min(1, v1 / 50));
  const bodySlip = Math.abs(kappa) * Math.min(BODY_SLIP_MAX_M, BODY_SLIP_PER_ACC * v1 * v1);
  return Math.sign(kappa) * (Math.min(curvature, frontSlip) + bodySlip);
}

/**
 * A driver that follows the racing line with pure-pursuit steering and tracks
 * the target speed profile. Used for the title-screen attract lap and for
 * automated verification of the physics (full-lap tests).
 */
export class Autopilot {
  /** Fraction of the profile speed to aim for. Prefer a profile built with a lower gripFactor for a careful AI. */
  pace = 1;
  private integral = 0;

  constructor(private readonly track: Track, private readonly line: RacingLine, private readonly profile: SpeedProfile) {}

  drive(v: Vehicle, out: VehicleInput): VehicleInput {
    const { track, line, profile } = this;
    const speed = v.speed;
    const s = v.tp.s;
    const n = track.n;
    // Stanley controller on the racing line, measured at the front axle:
    // steer = curvature feed-forward + heading error + cross-track correction.
    const fa = v.spec.dimensions.wheelbase * (1 - v.spec.frontWeight);
    const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
    const fx = v.x + sin * fa, fz = v.z + cos * fa;
    const i0 = Math.round((s + fa) / track.spacing) % n;
    let best = i0, bestD = Infinity;
    for (let k = -6; k <= 6; k++) {
      const i = (i0 + k + n) % n;
      const d = (line.x[i] - fx) ** 2 + (line.z[i] - fz) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    // Measure both errors where the front axle projects onto the line between samples. The nearest
    // 4 m sample can sit 2 m ahead: on Adelaide's 13 m hairpin its segment heading pointed up to
    // 0.3 rad into the corner, and the car settled 1.2 m inside the line, onto the inside wall.
    const [bx, bz] = lineTangent(line, best, n);
    const a = (fx - line.x[best]) * bx + (fz - line.z[best]) * bz >= 0 ? best : (best - 1 + n) % n, b = (a + 1) % n;
    const abx = line.x[b] - line.x[a], abz = line.z[b] - line.z[a];
    const u = Math.max(0, Math.min(1, ((fx - line.x[a]) * abx + (fz - line.z[a]) * abz) / (abx * abx + abz * abz || 1)));
    const [ax, az] = lineTangent(line, a, n);
    const [cx, cz] = lineTangent(line, b, n);
    const lineHeading = Math.atan2(ax + (cx - ax) * u, az + (cz - az) * u);
    let headErr = lineHeading - v.heading;
    while (headErr > Math.PI) headErr -= 2 * Math.PI;
    while (headErr < -Math.PI) headErr += 2 * Math.PI;
    // Cross-track error: + = line is to the car's left.
    const ex = line.x[a] + abx * u - fx, ez = line.z[a] + abz * u - fz;
    const cross = ex * cos - ez * sin;
    const v1 = Math.max(4, Math.abs(speed));
    const preview = Math.round((Math.max(4, v1 * 0.25)) / track.spacing);
    const kappa = line.curvature[(best + preview) % n];
    const delta = feedForward(v, kappa, v1) + headErr + Math.atan((2.2 * cross) / (v1 + 2)) - v.yawRate * 0.02;
    out.steer = Math.max(-1, Math.min(1, delta / v.spec.maxSteerRad));
    const crossErr = Math.abs(cross);

    // Speed control: profile speed a little ahead (reaction time).
    const ka = Math.round((s + Math.max(2, speed * 0.3)) / track.spacing) % n;
    // Slow down a little when off the line, so that the car can recover it.
    // Extra care in steep downhill corners (Dipper, Forrest's Elbow): the rear goes light there.
    const downhill = Math.abs(line.curvature[ka]) > 1 / 140 ? Math.min(0.14, Math.max(0, -track.grade[ka] - 0.04) * 1.3) : 0;
    const target = profile.speed[ka] * this.pace * (1 - downhill) * (1 - Math.min(0.15, Math.max(0, crossErr - 0.8) * 0.05));
    const err = target - speed;
    // Integrate only near the target (anti-windup): a long braking zone must not
    // leave the car coasting below the target speed through the next corner.
    if (Math.abs(err) < 2) this.integral = Math.max(-0.3, Math.min(0.3, this.integral + err * 0.002));
    const cmd = err * 0.35 + this.integral;
    out.throttle = Math.max(0, Math.min(1, cmd + 0.35));
    out.brake = Math.max(0, Math.min(1, -cmd * 0.55 - 0.12));
    // Trail braking: release the brake as the steering winds on and as the
    // cornering load rises (friction ellipse, from the current lateral g).
    out.brake *= Math.max(0.25, 1 - Math.abs(out.steer) * 1.1);
    const lateralUse = Math.min(1, Math.abs(speed * v.yawRate) / (v.spec.tyreMu * v.handling.grip * 9.81));
    out.brake *= Math.max(0.3, Math.sqrt(1 - lateralUse * lateralUse));
    // Catch a slide: when the rear steps out, come off the brake and the throttle.
    const sn = Math.sin(v.heading), cs = Math.cos(v.heading);
    const beta = Math.abs(Math.atan2(v.vx * cs - v.vz * sn, Math.max(1, v.vx * sn + v.vz * cs)));
    if (speed > 12 && beta > 0.07) {
      const release = Math.max(0.15, 1 - (beta - 0.07) * 10);
      out.brake *= release;
      out.throttle *= release;
    }
    if (out.brake > 0.05) out.throttle = 0;
    out.shiftUp = false;
    out.shiftDown = false;
    return out;
  }
}
