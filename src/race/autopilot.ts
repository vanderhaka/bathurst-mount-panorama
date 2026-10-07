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
    const nx = line.x[(best + 1) % n] - line.x[best], nz = line.z[(best + 1) % n] - line.z[best];
    const lineHeading = Math.atan2(nx, nz);
    let headErr = lineHeading - v.heading;
    while (headErr > Math.PI) headErr -= 2 * Math.PI;
    while (headErr < -Math.PI) headErr += 2 * Math.PI;
    // Cross-track error: + = line is to the car's left.
    const ex = line.x[best] - fx, ez = line.z[best] - fz;
    const cross = ex * cos - ez * sin;
    const v1 = Math.max(4, Math.abs(speed));
    const preview = Math.round((Math.max(4, v1 * 0.25)) / track.spacing);
    const kappa = line.curvature[(best + preview) % n];
    const delta = kappa * v.spec.dimensions.wheelbase * (1 + 0.15 * Math.min(1, v1 / 50)) + headErr + Math.atan((2.2 * cross) / (v1 + 2)) - v.yawRate * 0.02;
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
