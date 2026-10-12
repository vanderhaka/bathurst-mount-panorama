// Race grid: a staggered two-wide start like real Supercars. Separate from src/race/grid.ts (the painted
// single-car boxes) but it keeps that convention: pole in the right column, 7 m behind the standing-start line.
import type { Track } from '@/track/track-model';

/** Pole car's centre of gravity behind the standing-start line (m). */
const POLE_BEHIND_LINE_M = 7;
/** Distance between consecutive slots along the road: half a row, so rows are 9 m apart (m). */
const STAGGER_M = 4.5;
/** Column centre from the road centreline (m). Same as the single-car grid. */
const COLUMN_M = 2.2;
/** Keep the car centre this far inside the road edge (m). */
const EDGE_MARGIN_M = 2;

/** Race start slots, slot 0 = pole. s is the lap distance (wrapped), d the lateral offset (+ = left). */
export function gridSlots(track: Track, count: number): { s: number; d: number }[] {
  const slots: { s: number; d: number }[] = [];
  for (let k = 0; k < count; k++) {
    const s = track.wrapS(track.gridLineS - POLE_BEHIND_LINE_M - k * STAGGER_M);
    const i = track.wrap(Math.round(s / track.spacing));
    const column = k % 2 === 0 ? -COLUMN_M : COLUMN_M;
    // Narrow stretches pull the column in rather than put a car on the kerb or wall.
    slots.push({ s, d: Math.max(-track.right.edge[i] + EDGE_MARGIN_M, Math.min(track.left.edge[i] - EDGE_MARGIN_M, column)) });
  }
  return slots;
}
