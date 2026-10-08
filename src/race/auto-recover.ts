/**
 * Automatic recovery (Casual): decides when a stuck car should be put back on the track.
 *
 * Wiring signature for the race controller:
 *   facingWrongWay(track: Track, index: number, heading: number): boolean
 * `index` is the car's track sample (`vehicle.tp.index`) and `heading` is `vehicle.heading`.
 * Heading convention (src/physics/vehicle.ts): 0 = +Z, positive = left, forward = (sin h, cos h);
 * Vehicle.reset sets it as atan2(track.tx[i], track.tz[i]), so the track direction is (tx, tz).
 */
import type { Track } from '@/track/track-model';

export interface RecoverInput {
  /** m/s, signed */
  speed: number;
  /** all four wheels off road and kerb */
  offTrack: boolean;
  wrongWay: boolean;
  /** 0..1 */
  throttle: number;
}

const WRONG_WAY_COS = Math.cos((100 * Math.PI) / 180);

/** Casual: decides when to put a stuck car back on the track. */
export class AutoRecover {
  static readonly HOLD_S = 3;
  static readonly STUCK_SPEED = 2; // m/s
  private stuckS = 0;

  /** True once when the car has been stuck for HOLD_S; the count then starts again. */
  update(dt: number, s: RecoverInput): boolean {
    const stuck = Math.abs(s.speed) < AutoRecover.STUCK_SPEED && (s.offTrack || s.wrongWay || s.throttle > 0.5);
    if (!stuck) { this.stuckS = 0; return false; }
    if (!(dt > 0)) return false;
    this.stuckS += dt;
    if (this.stuckS < AutoRecover.HOLD_S) return false;
    this.stuckS = 0;
    return true;
  }

  reset(): void { this.stuckS = 0; }
}

/** True when the car points more than 100° away from the track's forward direction at its position. */
export function facingWrongWay(track: Track, index: number, heading: number): boolean {
  const tx = track.tx[index], tz = track.tz[index], len = Math.hypot(tx, tz);
  if (!(len > 1e-6) || !Number.isFinite(heading)) return false;
  return (Math.sin(heading) * tx + Math.cos(heading) * tz) / len < WRONG_WAY_COS;
}
