import type { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, pointAt, projectToTrack } from '@/track/track-query';

/** Trackside TV cameras: one every TV_SPACING metres on alternating sides, 3 m behind the wall. */
export const TV_SPACING = 220;
export const TV_HEIGHT = 6;
/** A camera takes over when the car is TV_LEAD metres before it, and holds it for TV_SPACING metres. */
export const TV_LEAD = 90;

/** Index of the TV camera that shows a car at track distance s. */
export function tvCameraIndex(track: Track, s: number): number {
  return Math.floor(track.wrapS(s + TV_LEAD) / TV_SPACING);
}

export function tvCameraCount(track: Track): number {
  return Math.ceil(track.length / TV_SPACING);
}

/** Height of the concrete wall (barriers.ts WALL_HEIGHT). */
const WALL_TOP = 1.05;
const MAX_HEIGHT = 18;

/**
 * World position of TV camera `idx` (lens height included). The lens is at least
 * TV_HEIGHT up, and higher where a wall (or the road dropping away, as at the
 * Dipper) would hide the car: every sight line to the car is sampled against the
 * walls it crosses.
 */
export function tvCameraPoint(track: Track, idx: number, out: [number, number, number]): [number, number, number] {
  const s = idx * TV_SPACING;
  const side = idx % 2 === 0 ? 1 : -1;
  const i = Math.floor(track.wrapS(s) / track.spacing);
  const wall = (side > 0 ? track.left : track.right).wall[i];
  pointAt(track, s, side * (wall + 3), out);
  const ground = out[1];
  const car: [number, number, number] = [0, 0, 0];
  const tp = createTrackPoint();
  let y = ground + TV_HEIGHT;
  for (let st = s - TV_LEAD; st <= s - TV_LEAD + TV_SPACING; st += 10) {
    pointAt(track, st, 0, car);
    const carY = car[1] + 0.8;
    for (let u = 0.05; u < 0.97; u += 0.04) {
      const x = out[0] + (car[0] - out[0]) * u, z = out[2] + (car[2] - out[2]) * u;
      projectToTrack(track, x, z, tp.index >= 0 ? tp.index : -1, tp);
      const w = (tp.d >= 0 ? track.left : track.right).wall[tp.index];
      if (Math.abs(Math.abs(tp.d) - w - 0.2) > 0.6) continue; // not on a wall
      const top = heightAt(track, tp.index, tp.t, Math.sign(tp.d) * w) + WALL_TOP + 0.3;
      y = Math.max(y, (top - carY * u) / (1 - u));
    }
  }
  out[1] = Math.min(y, ground + MAX_HEIGHT);
  return out;
}
