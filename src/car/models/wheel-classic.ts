// Classic 1970s rim in the wheel frame (axle along X, outer face towards +X): a flat
// dark face set back from the outer edge, slim spokes (V pairs at detail 'high'), a
// flat hub disc, five wheel nuts and a polished deep-dish outer lip.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WheelStyle } from '@/car/models/profile-types';

const FACE_COLOUR = 0x161616;
const LIP_COLOUR = 0xc9c9c9;
const NUT_COLOUR = 0x8a8a8a;
const FACE_SETBACK = 0.06;
const NUT_PITCH_RADIUS = 0.06;
const HUB_RADIUS = 0.05;
const NUT_COUNT = 5;

/** Absolute linear vertex colours; the caller turns them into ratios when the material multiplies. */
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Lathe around the X axis from (radius, lateral) pairs ordered by increasing lateral. */
function latheX(points: ReadonlyArray<readonly [number, number]>, segments: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(points.map(([r, w]) => new THREE.Vector2(r, w)), segments);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** A flat bar (box) from radius r0 to r1 whose angle runs from a0 at r0 to a1 at r1, at lateral x. */
function bar(r0: number, a0: number, r1: number, a1: number, x: number, width: number, depth: number): THREE.BufferGeometry {
  const corner = (r: number, a: number, side: number, lat: number): number[] => {
    const tx = -Math.sin(a) * side * (width / 2);
    const ty = Math.cos(a) * side * (width / 2);
    return [x + lat, r * Math.cos(a) + tx, r * Math.sin(a) + ty];
  };
  const pos: number[] = [];
  for (const [r, a] of [[r0, a0], [r1, a1]] as const) {
    for (const [side, lat] of [[-1, 0], [1, 0], [1, -depth], [-1, -depth]] as const) pos.push(...corner(r, a, side, lat));
  }
  // Corners 0-3 at the hub end, 4-7 at the rim end; the front face and the two sides.
  const idx = [0, 5, 1, 0, 4, 5, 1, 6, 2, 1, 5, 6, 3, 4, 0, 3, 7, 4];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** Spokes: `spokes` bars at 'high' grouped as V pairs (spokes / 2 pairs), plain radial bars at 'low'. */
function spokeSet(spokes: number, high: boolean, rOut: number, x: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const rIn = HUB_RADIUS * 0.8;
  if (!high) {
    for (let s = 0; s < spokes; s++) {
      const a = (s / spokes) * Math.PI * 2;
      out.push(bar(rIn, a, rOut, a, x, 0.026, 0.01));
    }
    return out;
  }
  const pairs = Math.max(1, Math.floor(spokes / 2));
  for (let p = 0; p < pairs; p++) {
    const a = (p / pairs) * Math.PI * 2;
    for (const side of [-1, 1]) out.push(bar(rIn, a + side * 0.05, rOut, a + side * 0.2, x, 0.018, 0.012));
  }
  return out;
}

/** 15 inch style rim; vertex colours are absolute (linear) and must be turned into ratios for a multiplying material. */
export function classicRimGeometry(style: WheelStyle, segments: number, spokes: number, high: boolean): THREE.BufferGeometry {
  const R = style.rimRadius;
  const W = style.rimHalfWidth;
  const xf = W - FACE_SETBACK;
  const parts: THREE.BufferGeometry[] = [];
  // Dark inner barrel behind the face (high only) and the flat hub disc.
  if (high) parts.push(paint(latheX([[R - 0.014, -W + 0.01], [R - 0.014, xf]], segments), FACE_COLOUR));
  parts.push(paint(new THREE.CircleGeometry(HUB_RADIUS, Math.max(10, segments / 2)).rotateY(Math.PI / 2).translate(xf + 0.004, 0, 0), FACE_COLOUR));
  for (const s of spokeSet(spokes, high, R - 0.012, xf)) parts.push(paint(s, FACE_COLOUR));
  // Polished deep-dish lip from the face out to the outer edge.
  const lip = high
    ? [[R - 0.014, xf], [R - 0.014, W - 0.01], [R - 0.002, W + 0.003], [R + 0.012, W + 0.002], [R + 0.013, W - 0.012]]
    : [[R - 0.014, xf], [R - 0.014, W - 0.01], [R + 0.012, W + 0.002]];
  parts.push(paint(latheX(lip as Array<[number, number]>, segments), LIP_COLOUR));
  if (high) {
    for (let n = 0; n < NUT_COUNT; n++) {
      const a = (n / NUT_COUNT) * Math.PI * 2 + Math.PI / 2;
      const nut = new THREE.CylinderGeometry(0.011, 0.012, 0.014, 6).rotateZ(-Math.PI / 2);
      parts.push(paint(nut.translate(xf + 0.011, NUT_PITCH_RADIUS * Math.cos(a), NUT_PITCH_RADIUS * Math.sin(a)), NUT_COLOUR));
    }
  }
  const flat = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    return g;
  });
  const g = mergeGeometries(flat);
  g.computeVertexNormals();
  return g;
}
