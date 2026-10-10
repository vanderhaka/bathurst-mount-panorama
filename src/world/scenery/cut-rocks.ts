import { PROP_VARIANTS } from '@/props';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import type { Terrain } from '@/world/terrain';
import { rng } from '@/world/scenery/geo';
import { addEmbeddedRock } from '@/world/scenery/rock-place';
import type { PropInstancer } from '@/world/scenery/instancer';

/** The Cutting (track distance, m): rock outcrops along the foot of the cut face. */
const CUTTING = { from: 1800, to: 2130 };

/** Half-buried boulders on the uphill bank of The Cutting, so the cut face reads as rock. */
export function placeCutRocks(track: Track, terrain: Terrain, inst: PropInstancer): number {
  const r = rng(5150);
  const p: [number, number, number] = [0, 0, 0];
  let count = 0;
  for (let s = CUTTING.from; s < CUTTING.to; s += 2.2) {
    const i = Math.floor(s / track.spacing);
    for (const sign of [1, -1] as const) {
      const side = sign > 0 ? track.left : track.right;
      pointAt(track, s, sign * (side.wall[i] + 1.0 + r() * 5.5), p);
      const ground = terrain.heightAt(p[0], p[2]);
      if (ground - p[1] < 1.2) continue; // no cut on this side here
      addEmbeddedRock(inst, terrain, Math.floor(r() * PROP_VARIANTS.rock), p[0], p[2], r() * Math.PI * 2, 0.9 + r() * 1.8);
      count++;
    }
  }
  return count;
}
