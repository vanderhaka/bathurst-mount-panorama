/** Comfort amount; zero keeps the cockpit camera fixed to its anchor. */
export const DEFAULT_HEAD_MOTION = 0.5;
export function headMotionAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : DEFAULT_HEAD_MOTION;
}

/** Camera-local position (metres) and lean (radians), looking along -Z. */
export interface HeadPose { x: number; z: number; pitch: number; roll: number }
const safeG = (g: number): number => Number.isFinite(g) ? Math.max(-3, Math.min(3, g)) : 0;

/** Smoothed inertial head response to the vehicle's measured acceleration in g. */
export class HeadMotion {
  readonly pose: HeadPose = { x: 0, z: 0, pitch: 0, roll: 0 };

  reset(): void { this.pose.x = this.pose.z = this.pose.pitch = this.pose.roll = 0; }

  update(gLong: number, gLat: number, amount: number, dt: number): HeadPose {
    const scale = headMotionAmount(amount);
    if (scale === 0) { this.reset(); return this.pose; }
    const seconds = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const response = 1 - Math.exp(-seconds * 10);
    const lateral = safeG(gLat) * scale, longitudinal = safeG(gLong) * scale;
    // +g left pushes the head right (+camera X); acceleration pushes it back (+camera Z).
    this.pose.x += (lateral * 0.025 - this.pose.x) * response;
    this.pose.z += (longitudinal * 0.03 - this.pose.z) * response;
    this.pose.pitch += (longitudinal * 0.025 - this.pose.pitch) * response;
    this.pose.roll += (-lateral * 0.025 - this.pose.roll) * response;
    return this.pose;
  }
}
