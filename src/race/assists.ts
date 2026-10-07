import type { DriverControls } from '@/input/input-manager';
import type { VehicleInput } from '@/physics/types';
import type { Vehicle } from '@/physics/vehicle';

export interface AssistSettings {
  steeringAssist: boolean;
}

/**
 * Converts raw controls into vehicle inputs. With the steering assist on, the
 * steering range shrinks with speed (so keyboard taps do not over-steer at
 * 250 km/h) and a mild counter-steer helps to catch slides.
 */
export function applyAssists(c: DriverControls, v: Vehicle, s: AssistSettings, out: VehicleInput): VehicleInput {
  const speed = Math.abs(v.speed);
  let steer = c.steer;
  if (s.steeringAssist) {
    const ref = c.analogSteer ? 62 : 40;
    steer *= 1 / (1 + (speed / ref) ** 2);
    // Body slip angle: + = the car moves to the left of where it points.
    const sin = Math.sin(v.heading), cos = Math.cos(v.heading);
    const vLong = v.vx * sin + v.vz * cos;
    const vLat = v.vx * cos - v.vz * sin;
    if (speed > 8) {
      const beta = Math.atan2(vLat, Math.abs(vLong));
      steer += (Math.max(-0.35, Math.min(0.35, beta)) * 0.7) / v.spec.maxSteerRad;
    }
  }
  out.steer = Math.max(-1, Math.min(1, steer));
  out.throttle = Math.max(0, Math.min(1, c.throttle));
  out.brake = Math.max(0, Math.min(1, c.brake));
  return out;
}
