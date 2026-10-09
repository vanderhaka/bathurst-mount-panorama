// 1979 HDT-style 15 x 10 inch alloy in the wheel frame (axle along X, outer face
// towards +X): a wide polished deep dish rolling out to a prominent lip, a flat
// satin-black centre recessed behind it with eight short radial slots (the
// drilled disc shows through them), a small hub cap and five wheel studs.
// Low detail keeps the dish, lip and a plain flat face.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WheelStyle } from '@/car/models/profile-types';

const FACE_COLOUR = 0x161616;
const HUB_COLOUR = 0x202022;
const LIP_COLOUR = 0xc9c9c9;
const NUT_COLOUR = 0x8a8a8a;
/** How far the flat centre sits behind the outer edge of the lip (m). */
const FACE_SETBACK = 0.078;
/** Radius where the flat centre meets the dish (m). */
const FACE_RADIUS = 0.148;
const SLOT_COUNT = 8;
/** Slots: radial extent (m) and half width (m). */
const SLOT_R0 = 0.078;
const SLOT_R1 = 0.13;
const SLOT_HALF_W = 0.0055;
const STUD_PITCH_RADIUS = 0.058;
const STUD_COUNT = 5;
const HUB_RADIUS = 0.044;
/** Lathe segments cap: the classic rim shares the Gen3 car's triangle budget, so it stays under the tyre's count. */
const MAX_SEGMENTS = 36;

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

/** Flat annular sector at lateral x from radius r0 to r1, angles a0..a1, facing +X, in `steps` angular pieces. */
function sector(r0: number, r1: number, a0: number, a1: number, x: number, steps: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= steps; k++) {
    const a = a0 + ((a1 - a0) * k) / steps;
    pos.push(x, r0 * Math.cos(a), r0 * Math.sin(a), x, r1 * Math.cos(a), r1 * Math.sin(a));
  }
  for (let k = 0; k < steps; k++) {
    const i = k * 2;
    idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** The flat centre: inner and outer rings plus the plates between the slots. */
function slottedFace(xf: number, segments: number): THREE.BufferGeometry[] {
  const parts = [
    latheX([[SLOT_R0 + 0.003, xf], [HUB_RADIUS - 0.004, xf]], segments),
    latheX([[FACE_RADIUS + 0.004, xf], [SLOT_R1 - 0.003, xf]], segments),
  ];
  const step = (Math.PI * 2) / SLOT_COUNT;
  for (let s = 0; s < SLOT_COUNT; s++) {
    const mid = s * step + step / 2;
    // Slot half-angle at the slot's mid radius keeps the slot sides roughly parallel.
    const half = SLOT_HALF_W / ((SLOT_R0 + SLOT_R1) / 2);
    parts.push(sector(SLOT_R0 - 0.004, SLOT_R1 + 0.004, mid + half, mid + step - half, xf, 3));
  }
  return parts.map((p) => paint(p, FACE_COLOUR));
}

/** Hub cap and five studs on the face (detail 'high' only; the flat face carries the low tier). */
function hubAndStuds(xf: number, segments: number, high: boolean): THREE.BufferGeometry[] {
  if (!high) return [];
  const out = [paint(latheX([[HUB_RADIUS, xf], [HUB_RADIUS, xf + 0.012], [0.001, xf + 0.016]], Math.max(10, segments / 2)), HUB_COLOUR)];
  for (let n = 0; n < STUD_COUNT; n++) {
    const a = (n / STUD_COUNT) * Math.PI * 2 + Math.PI / 2;
    const stud = new THREE.CylinderGeometry(0.009, 0.01, 0.012, 5).rotateZ(-Math.PI / 2);
    out.push(paint(stud.translate(xf + 0.008, STUD_PITCH_RADIUS * Math.cos(a), STUD_PITCH_RADIUS * Math.sin(a)), NUT_COLOUR));
  }
  return out;
}

/** 15 inch deep-dish alloy; vertex colours are absolute (linear) and must be turned into ratios for a multiplying material. */
export function classicRimGeometry(style: WheelStyle, tyreSegments: number, _spokes: number, high: boolean): THREE.BufferGeometry {
  const R = style.rimRadius;
  const W = style.rimHalfWidth;
  const xf = W - FACE_SETBACK;
  const segments = Math.min(tyreSegments, MAX_SEGMENTS);
  const parts: THREE.BufferGeometry[] = [];
  // Polished dish: from the edge of the flat centre, a concave sweep out to the rolled lip. (The drilled
  // disc sits right behind the slots, so no barrel is needed behind the face.)
  const dish = high
    ? [[FACE_RADIUS, xf], [FACE_RADIUS + 0.014, xf + 0.008], [R - 0.012, W - 0.02], [R + 0.005, W], [R + 0.015, W - 0.012]]
    : [[FACE_RADIUS, xf], [R - 0.01, W - 0.018], [R + 0.013, W + 0.002]];
  parts.push(paint(latheX(dish as Array<[number, number]>, segments), LIP_COLOUR));
  if (high) parts.push(...slottedFace(xf, segments));
  else parts.push(paint(new THREE.CircleGeometry(FACE_RADIUS + 0.002, Math.max(10, segments)).rotateY(Math.PI / 2).translate(xf, 0, 0), FACE_COLOUR));
  parts.push(...hubAndStuds(xf, segments, high));
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
