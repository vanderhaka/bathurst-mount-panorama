import * as THREE from 'three';
import type { GridBar } from '@/race/grid';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';

/** Height of paint above the road surface (m). */
const LIFT = 0.007;

/**
 * One painted bar as a flat quad at exact distances along the road (not snapped to a track sample, so
 * it lines up with the car it marks). Attributes match `buildStrip`, so it merges with the strips.
 */
export function buildGridBar(track: Track, bar: GridBar, colour: THREE.Color): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], uv: number[] = [];
  const p: [number, number, number] = [0, 0, 0];
  // Same corner order as a two-sample, one-segment strip: (near, right), (near, left), (far, right), (far, left).
  const corners: Array<[number, number]> = [[bar.s0, bar.d0], [bar.s0, bar.d1], [bar.s1, bar.d0], [bar.s1, bar.d1]];
  for (const [s, d] of corners) {
    pointAt(track, s, d, p);
    pos.push(p[0], p[1] + LIFT, p[2]);
    col.push(colour.r, colour.g, colour.b);
    uv.push(d, s);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex([0, 2, 3, 0, 3, 1]);
  geo.computeVertexNormals();
  return geo;
}
