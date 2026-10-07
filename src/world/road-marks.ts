import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RacingLine } from '@/track/racing-line';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';
import { brakeRatio, LINE_RED } from '@/world/racing-line-mesh';
import { buildStrip } from '@/world/strip';
import { clamp01, surfaceNoise } from '@/world/surface-noise';

/** Static rubber from heavy profile braking, using the HUD's braking-demand definition. */
export function brakingSkidStrength(track: Track, line: RacingLine, profile: SpeedProfile): Float32Array {
  const strength = new Float32Array(track.n);
  for (let i = 0; i < track.n; i++) {
    let distance = 0, ratio = 0;
    for (let ahead = 1; distance < 100 && ahead < track.n; ahead++) {
      const j = track.wrap(i + ahead);
      distance += line.ds[track.wrap(j - 1)];
      if (distance < 20) continue;
      ratio = Math.max(ratio, brakeRatio(profile.speed[j], profile.speed[i], distance));
    }
    strength[i] = clamp01((ratio - LINE_RED) / 0.4);
  }
  return strength;
}

function withAlpha(geometry: THREE.BufferGeometry, alpha: number[]): THREE.BufferGeometry {
  const old = geometry.getAttribute('color');
  const colours = new Float32Array(old.count * 4);
  for (let v = 0; v < old.count; v++) colours.set([old.getX(v), old.getY(v), old.getZ(v), alpha[v]], v * 4);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 4));
  return geometry;
}

export function buildBrakingSkids(track: Track, line: RacingLine, profile: SpeedProfile): THREE.BufferGeometry {
  const demand = brakingSkidStrength(track, line, profile), parts: THREE.BufferGeometry[] = [];
  for (const tyre of [-0.82, 0.82]) {
    const alpha: number[] = [];
    const centre = (i: number) => Math.max(-track.right.edge[i] + 0.3, Math.min(track.left.edge[i] - 0.3, line.offset[i] + tyre));
    const geo = buildStrip(track, {
      include: (i) => demand[i] > 0.01,
      from: (i) => centre(i) - 0.13,
      to: (i) => centre(i) + 0.13,
      segments: 4, lift: () => 0.003,
      colour: (i, u, _d, c) => {
        c.setRGB(1, 1, 1);
        alpha.push(demand[i] * Math.sin(u * Math.PI) ** 0.7 * (0.65 + surfaceNoise(0.3, i / track.n, 256, 58) * 0.35));
      },
    });
    parts.push(withAlpha(geo, alpha));
  }
  const merged = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  return merged;
}

/** Outside contact zones; generated scuffs only, never brand panels or photo decals. */
export const WALL_SCUFF_ZONES = [
  { name: 'The Chase', from: 5620, to: 5680 },
  { name: "Murray's Corner", from: 6160, to: 6213 },
  { name: "Forrest's Elbow", from: 3990, to: 4050 },
] as const;

export function buildWallScuffs(track: Track): THREE.BufferGeometry {
  const alpha: number[] = [], samples: number[] = [];
  const side = track.right;
  const heights = [0.2, 0.3, 0.45, 0.65, 0.85];
  const wallOffset = (i: number, height: number) => {
    const face = height <= 0.3 ? (height - 0.08) * 0.07 / 0.22 : 0.07 + (height - 0.3) * 0.06 / 0.75;
    return side.wall[i] + (side.barrier[i] === 'tyres' ? -0.009 : face - 0.006);
  };
  const geometry = buildStrip(track, {
    include: (i) => WALL_SCUFF_ZONES.some((z) => i * track.spacing >= z.from && i * track.spacing <= z.to),
    from: (i) => -wallOffset(i, heights[0]),
    to: (i) => -wallOffset(i, heights[4]),
    segments: 4,
    lift: (i, u, d) => heightAt(track, i, 0, -side.wall[i]) + 0.2 + u * 0.65 - heightAt(track, i, 0, d),
    colour: (i, u, _d, c) => {
      const s = i * track.spacing;
      const zone = WALL_SCUFF_ZONES.find((z) => s >= z.from && s <= z.to)!;
      const fade = Math.min(1, (s - zone.from) / 8, (zone.to - s) / 8);
      const noise = surfaceNoise(s / 12, u, 16, 29);
      c.setRGB(1, 1, 1);
      samples.push(i);
      const vertical = (heights[Math.round(u * 4)] - 0.2) / 0.65;
      alpha.push(clamp01(fade) * Math.sin(vertical * Math.PI) ** 0.8 * (0.2 + noise * 0.7));
    },
  });
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let v = 0; v < uv.count; v++) {
    const i = samples[v], height = heights[v % 5], d = -wallOffset(i, height);
    position.setXYZ(v, track.px[i] + track.lx[i] * d, heightAt(track, i, 0, -side.wall[i]) + height, track.pz[i] + track.lz[i] * d);
    uv.setXY(v, height, uv.getY(v));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return withAlpha(geometry, alpha);
}
