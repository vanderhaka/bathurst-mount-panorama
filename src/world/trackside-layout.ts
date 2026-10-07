import featuresJson from '@/track/data/features.json';
import { TYRE_WALL_DEPTH } from '@/track/apply-layout';
import { TYRE_WALLS } from '@/track/layout';
import type { Track } from '@/track/track-model';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import { TV_SPACING, tvCameraPoint } from '@/track/tv-cameras';
import type { WallScuff } from '@/world/trackside-materials';
import { yawFacingTrack } from '@/world/scenery/geo';

const FEATURES = featuresJson as { marshalPosts: Array<{ name: string; xz: number[] }>; towers: number[][] };
export interface DetailGround { heightAt(x: number, z: number): number; clearance(x: number, z: number): number }
export interface TracksidePropOptions {
  enabled: boolean; flags: boolean; towers: boolean; extraTvTowers: boolean; cones: boolean; tyreBundles: boolean;
  blocked?: (x: number, z: number, radius: number) => boolean;
}
export const TRACKSIDE_PROP_PRESETS = {
  low: { enabled: false, flags: false, towers: false, extraTvTowers: false, cones: false, tyreBundles: false },
  medium: { enabled: true, flags: true, towers: true, extraTvTowers: false, cones: true, tyreBundles: false },
  high: { enabled: true, flags: true, towers: true, extraTvTowers: true, cones: true, tyreBundles: true },
} as const;
export interface DetailPlacement {
  kind: 'flag' | 'tower' | 'cone' | 'tyre'; variant: number; x: number; y: number; z: number; yaw: number; radius: number; label: string;
}

/** Scuffs follow mapped protection walls rather than random dark spots along the whole lap. */
export function wallImpactScuffs(track: Track): WallScuff[] {
  const out: [number, number, number] = [0, 0, 0];
  return TYRE_WALLS.map(range => {
    const s = (range.from + range.to) / 2, i = Math.floor(track.wrapS(s) / track.spacing);
    const side = range.side > 0 ? track.left : track.right;
    pointAt(track, s, range.side * (side.wall[i] + TYRE_WALL_DEPTH + 0.095), out);
    return { x: out[0], y: out[1] + 0.46, z: out[2], radius: range.to - range.from < 60 ? 1.5 : 2.5 };
  });
}

/** Mapped towers replace facilities.ts towers; marshal huts remain, with flags beside them. */
export function tracksidePlacements(track: Track, ground: DetailGround, options: TracksidePropOptions): DetailPlacement[] {
  const result: DetailPlacement[] = [];
  if (!options.enabled) return result;
  const tp = createTrackPoint(), out: [number, number, number] = [0, 0, 0];
  const add = (kind: DetailPlacement['kind'], x: number, z: number, label: string, radius: number, variant = 0, mapped = false) => {
    projectToTrack(track, x, z, -1, tp);
    const side = tp.d >= 0 ? track.left : track.right;
    if (Math.abs(tp.d) - side.wall[tp.index] <= radius + 0.25 || ground.clearance(x, z) <= radius + 0.25) return;
    if (!mapped && options.blocked?.(x, z, radius)) return;
    if (result.some(p => p.kind === kind && Math.hypot(p.x - x, p.z - z) < radius * 2)) return;
    const footprint = kind === 'tower' ? 1.05 : kind === 'cone' ? 0.24 : kind === 'tyre' ? 0.27 : 0.12;
    const heights = [ground.heightAt(x, z)];
    for (const dx of [-footprint, footprint]) for (const dz of [-footprint, footprint]) heights.push(ground.heightAt(x + dx, z + dz));
    const low = Math.min(...heights), high = Math.max(...heights);
    const tolerance = kind === 'tower' ? 1.4 : kind === 'flag' ? 0.6 : kind === 'tyre' ? 0.32 : 0.28;
    if (high - low > tolerance) return;
    result.push({ kind, variant, x, y: low, z, yaw: yawFacingTrack(track, x, z), radius, label });
  };
  if (options.flags) for (const post of FEATURES.marshalPosts) {
    const [x, z] = post.xz, i = track.nearestIndex(x, z);
    const dx = x - track.px[i], dz = z - track.pz[i], length = Math.max(1, Math.hypot(dx, dz));
    add('flag', x + dx / length * 2.8, z + dz / length * 2.8, post.name, 1.2, 0, true);
  }
  if (options.towers) FEATURES.towers.forEach(([x, z], k) => add('tower', x, z, `Mapped TV tower ${k + 1}`, 1.6, 0, true));
  if (options.extraTvTowers) for (const [label, s] of [['Pit Straight', 150], ['Skyline', 3300], ["Murray's Corner", 6130]] as const) {
    const index = Math.floor(track.wrapS(s) / TV_SPACING), i = Math.floor(track.wrapS(index * TV_SPACING) / track.spacing);
    const sign = index % 2 === 0 ? 1 : -1;
    tvCameraPoint(track, index, out);
    // Put the scaffold behind the existing lens, outside its cleared sight line.
    const x = out[0] + track.lx[i] * sign * 3.3 - track.tx[i] * 4;
    const z = out[2] + track.lz[i] * sign * 3.3 - track.tz[i] * 4;
    add('tower', x, z, `${label} TV position`, 1.6);
  }
  if (options.cones) for (const [label, s, sign] of [['Hell Corner service gate', 520, -1], ["Murray's Corner service gate", 6170, -1], ['Pit Straight service gate', 300, -1]] as const) {
    for (let k = 0; k < 4; k++) {
      const at = track.wrapS(s + k * 1.7), i = Math.floor(at / track.spacing), side = sign > 0 ? track.left : track.right;
      pointAt(track, at, sign * (side.wall[i] + (side.barrier[i] === 'tyres' ? TYRE_WALL_DEPTH : 0) + 1.1), out);
      add('cone', out[0], out[2], label, 0.3);
    }
  }
  if (options.tyreBundles) TYRE_WALLS.forEach((range, k) => {
    const middle = (range.from + range.to) / 2, label = track.placeAt(middle);
    for (let n = 0; n < 3; n++) {
      const s = middle + (n - 1) * 0.9, i = Math.floor(track.wrapS(s) / track.spacing), side = range.side > 0 ? track.left : track.right;
      pointAt(track, s, range.side * (side.wall[i] + TYRE_WALL_DEPTH + 1.4), out);
      add('tyre', out[0], out[2], `${label} spare tyre bundle`, 0.35, k % 2 === 0 ? 2 : 3);
    }
  });
  return result;
}
