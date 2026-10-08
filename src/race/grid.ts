// Standing-start grid: where the cars stand and where the white boxes are painted. One definition
// feeds both, so the markings cannot drift away from the cars.
import { CAR_SPECS } from '@/car/car-specs';
import type { Track } from '@/track/track-model';

/** Painted grid slots, nearest the standing-start line first (slot 0 is pole). */
export const GRID_SLOTS = 12;
/** Pole car's centre of gravity, behind the standing-start line (m). */
const POLE_BEHIND_LINE_M = 7;
/** Distance between rows; consecutive slots sit in opposite columns (m). */
const ROW_M = 8;
/** Column centre from the road centreline (m). Pole is in the right column. */
const COLUMN_M = 2.2;
/** Gap between a car's nose and the painted bar ahead of it (m). */
const NOSE_CLEARANCE_M = 0.7;
/** Painted bar: length along the road and half-width across the box (m). */
export const BAR_LENGTH_M = 0.24;
const BAR_HALF_WIDTH_M = 1.9;
/** Centre of gravity to nose: the front axle is 47 % of the wheelbase ahead of it, plus the front overhang (m). */
const NOSE_M = Math.max(...Object.values(CAR_SPECS).map((c) => c.dimensions.wheelbase * (1 - c.frontWeight) + c.dimensions.frontOverhang));

/** Where a car is put: lap distance s and lateral offset d (+ = left), as passed to `CarEntity.reset`. */
export interface GridSlot { s: number; d: number }

export function gridSlot(track: Track, index: number): GridSlot {
  const s = track.gridLineS - POLE_BEHIND_LINE_M - index * ROW_M;
  const i = track.wrap(Math.round(s / track.spacing));
  const column = index % 2 === 0 ? -COLUMN_M : COLUMN_M;
  return { s, d: Math.max(-track.right.edge[i] + 2, Math.min(track.left.edge[i] - 2, column)) };
}

/** The white bar painted across a slot, just ahead of the car's nose and as wide as the car plus a margin. */
export interface GridBar { s0: number; s1: number; d0: number; d1: number }

export function gridBar(track: Track, index: number): GridBar {
  const { s, d } = gridSlot(track, index);
  // Vehicle.reset puts the car's centre of gravity on the sample at or behind s.
  const cg = Math.floor(track.wrapS(s) / track.spacing) * track.spacing;
  const front = cg + NOSE_M + NOSE_CLEARANCE_M;
  return { s0: front, s1: front + BAR_LENGTH_M, d0: d - BAR_HALF_WIDTH_M, d1: d + BAR_HALF_WIDTH_M };
}
