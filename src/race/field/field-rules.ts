// Small rules of the AI field: how a car-to-car hit looks to one of the cars, where a stuck car is put back, and
// when it counts as stuck.
import type { ImpactReport } from '@/physics/types';
import type { CarHit } from '@/race/field/car-contact';

/** Closing speed (m/s) below which a contact is a touch: no sparks, dents or shake. */
export const HIT_MIN_MPS = 1.5;
/** A car this slow (m/s) for SLOW_S, once the race is under way, is put back on the line. */
const SLOW_MPS = 2;
const SLOW_S = 3;
/** Off the road and pointing the wrong way for this long (s). */
const WRONG_WAY_S = 2;
/** Cars do not count as stuck before the field has sorted itself out after the start (s). */
export const SETTLE_S = 5;

/**
 * A contact as a wall-style impact on one car (`car` = the hit's a or b index). The normal of a wall report points
 * away from the obstacle, so it is the contact normal (a to b) reversed for a and as is for b.
 */
export function hitReport(hit: CarHit, car: number): ImpactReport {
  const sign = car === hit.a ? -1 : 1;
  return { x: hit.x, y: hit.y, z: hit.z, nx: hit.nx * sign, nz: hit.nz * sign, speed: hit.speed };
}

function wrapDelta(d: number, length: number): number {
  return ((((d + length / 2) % length) + length) % length) - length / 2;
}

/**
 * Where to put a car back: `s` if no other car is within `gap` metres along the track, else the nearest spot found
 * stepping back and forward by `step` metres, up to `reach`. Falls back to `s`.
 */
export function clearSpot(length: number, s: number, others: readonly number[], gap = 9, step = 10, reach = 150): number {
  for (let k = 0; k * step <= reach; k++) {
    for (const sign of k === 0 ? [0] : [-1, 1]) {
      const at = (((s + sign * k * step) % length) + length) % length;
      if (others.every((o) => Math.abs(wrapDelta(at - o, length)) >= gap)) return at;
    }
  }
  return s;
}

/** Times how long one AI car has been stuck: nearly stopped, or off the road facing backwards. */
export class StuckWatch {
  private slowT = 0;
  private wrongT = 0;

  /** True once when the car should be put back on the line; the timers then start again. */
  update(h: number, settled: boolean, speed: number, offRoad: boolean, wrongWay: boolean): boolean {
    this.slowT = settled && Math.abs(speed) < SLOW_MPS ? this.slowT + h : 0;
    this.wrongT = offRoad && wrongWay ? this.wrongT + h : 0;
    if (this.slowT <= SLOW_S && this.wrongT <= WRONG_WAY_S) return false;
    this.reset();
    return true;
  }

  reset(): void { this.slowT = this.wrongT = 0; }
}
