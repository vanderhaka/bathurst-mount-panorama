import type { FuelReading } from '@/physics/fuel';
import type { TyreReading } from '@/physics/tyre-state';
import type { SurfaceKind } from '@/track/track-query';

/** Driver inputs after smoothing/assists. */
export interface VehicleInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  /** -1 = full right, +1 = full left. */
  steer: number;
  shiftUp: boolean;
  shiftDown: boolean;
  /** Held on the grid: brakes on, no automatic shift into reverse. */
  hold?: boolean;
}

export interface DamageState {
  front: number;
  rear: number;
  left: number;
  right: number;
  engine: number;
  suspension: number;
  aero: number;
}

export interface WheelTelemetry {
  load: number; // N
  /** Combined slip use 0..1+ (1 = at the limit, >1 = sliding). */
  slip: number;
  surface: SurfaceKind;
  /** Accumulated spin angle (rad) for the visual wheel. */
  spin: number;
  /** Suspension compression relative to static (m, + = compressed). */
  compression: number;
  steer: number;
}

export interface VehicleTelemetry {
  fuel: FuelReading;
  tyres: readonly TyreReading[];
  speed: number; // m/s, signed along heading
  rpm: number;
  gear: number; // -1 R, 0 N, 1..6
  throttle: number;
  brake: number;
  steer: number;
  onLimiter: boolean;
  tcActive: boolean;
  absActive: boolean;
  shifted: boolean;
  /** Longitudinal and lateral acceleration in g. */
  gLong: number;
  gLat: number;
  wheels: WheelTelemetry[];
  /** True when no wheel touches the ground. */
  airborne: boolean;
  /** Engine load 0..1 for audio. */
  load: number;
}

/** A wall impact this step (world-space), for damage, audio and the car model. */
export interface ImpactReport {
  /** World contact point. */
  x: number;
  y: number;
  z: number;
  /** Horizontal unit normal of the wall, pointing back towards the track. */
  nx: number;
  nz: number;
  /** Impact speed along the normal (m/s). */
  speed: number;
}
