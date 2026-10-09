// Wheel parts in the wheel frame: axle along X, outer face towards +X, centre
// at the origin. Tyre and rim barrel are lathed profiles; the rim face is made
// of real tapered, dished spokes with a polished lip; the brake disc and caliper sit inside.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { WheelStyle } from '@/car/models/profile-types';

const RIM_RADIUS = 0.2286; // 18 inch
const RIM_HALF_WIDTH = 0.1397; // 11 inch

/** The Gen3 18 x 11 inch wheel. */
export const GEN3_WHEEL: WheelStyle = { kind: 'gen3', rimRadius: RIM_RADIUS, rimHalfWidth: RIM_HALF_WIDTH, discRadius: 0.183 };

/** Lathe around the X axis from (radius, lateral) pairs ordered by increasing lateral. */
function latheX(points: ReadonlyArray<readonly [number, number]>, segments: number): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(points.map(([r, w]) => new THREE.Vector2(r, w)), segments);
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Slick tyre with a rounded sidewall and shoulder. */
export function tyreGeometry(radius: number, width: number, segments: number, high: boolean, rimRadius = RIM_RADIUS): THREE.BufferGeometry {
  const h = width / 2;
  const bead = rimRadius + 0.008;
  const side = high
    ? [[bead, 0.94], [bead + 0.022, 0.985], [(bead + radius) / 2, 1.0], [radius - 0.04, 0.985], [radius - 0.016, 0.935], [radius - 0.004, 0.84], [radius, 0.62], [radius, 0.25]]
    : [[bead, 0.95], [(bead + radius) / 2, 1.0], [radius - 0.014, 0.93], [radius, 0.55]];
  const pts: Array<[number, number]> = [];
  for (const [r, f] of side) pts.push([r, -f * h]);
  for (let i = side.length - 1; i >= 0; i--) pts.push([side[i][0], side[i][1] * h]);
  return latheX(pts, segments);
}

/** Vertex colours of `colour` relative to a material colour `base` (linear, per channel), for a multiplying material. */
export function ratioTint(g: THREE.BufferGeometry, colour: number, base: number): THREE.BufferGeometry {
  const c = new THREE.Color(colour);
  const b = new THREE.Color(base);
  const k = [c.r / Math.max(0.01, b.r), c.g / Math.max(0.01, b.g), c.b / Math.max(0.01, b.b)];
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(k, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Dished, tapered spokes with a centre ridge (two lit faces per spoke) from the hub out to the lip. */
function spokeGeometry(count: number, high: boolean, rimRadius: number, halfWidth: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const steps = high ? 3 : 1;
  const rIn = 0.062;
  const rOut = rimRadius - 0.01;
  const ridge = high ? 0.008 : 0;
  for (let s = 0; s < count; s++) {
    const ang = (s / count) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const r = rIn + (rOut - rIn) * t;
      const w = 0.084 + (halfWidth - 0.008 - 0.084) * Math.pow(t, 0.65);
      const half = (0.031 - 0.013 * t) * (high ? 1 : 1.25);
      const depth = 0.034;
      // Corners: front-left, ridge, front-right, back-right, back-left (tangent, lateral).
      for (const [tan, lat] of [[-half, 0], [0, ridge], [half, 0], [half * 1.15, -depth], [-half * 1.15, -depth]] as const) {
        pos.push(w + lat, r * ca - tan * sa, r * sa + tan * ca);
      }
    }
    for (let k = 0; k < steps; k++) {
      const a = base + k * 5;
      const b = a + 5;
      for (const [i, j] of [[0, 1], [1, 2], [2, 3], [4, 0]] as const) idx.push(a + i, b + j, a + j, a + i, b + i, b + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/**
 * Rim: inner barrel (seen through the spokes), dished spokes, hub and the polished
 * outer lip. Vertex colours are ratios against the rim material colour: 1 on the
 * barrel, spokes and hub; lip / rim on the lip (when `lip` is given).
 */
export function rimGeometry(segments: number, spokes: number, high: boolean, style: WheelStyle = GEN3_WHEEL, lip: { colour: number; base: number } | null = null): THREE.BufferGeometry {
  const R = style.rimRadius;
  const W = style.rimHalfWidth;
  const barrel = latheX(
    high
      ? [[R + 0.01, -W], [R - 0.016, -W + 0.02], [R - 0.02, 0.06], [R - 0.014, W - 0.03], [R - 0.012, W - 0.014]]
      : [[R - 0.018, -W + 0.02], [R - 0.016, W - 0.01], [R + 0.012, W + 0.002]],
    segments,
  );
  const hub = latheX(high ? [[0.074, 0.06], [0.072, 0.088], [0.058, 0.1], [0.03, 0.104], [0.001, 0.104]] : [[0.07, 0.08], [0.001, 0.1]], Math.max(10, segments / 2));
  const parts = [barrel.toNonIndexed(), hub.toNonIndexed(), spokeGeometry(spokes, high, R, W)];
  // Polished lip: a rolled outer edge that steps up from the barrel and turns over the rim.
  if (high) {
    const lipGeo = latheX([[R - 0.012, W - 0.014], [R - 0.002, W - 0.004], [R + 0.006, W + 0.004], [R + 0.014, W + 0.002], [R + 0.015, W - 0.012]], segments).toNonIndexed();
    if (lip) {
      for (const p of parts) ratioTint(p, lip.base, lip.base);
      ratioTint(lipGeo, lip.colour, lip.base);
    }
    parts.push(lipGeo);
  }
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('normal'); return p; }));
  g.computeVertexNormals();
  return g;
}

/** Centre-lock wheel nut (hex with a domed cap). */
export function nutGeometry(): THREE.BufferGeometry {
  const hex = new THREE.CylinderGeometry(0.04, 0.043, 0.03, 6).rotateZ(-Math.PI / 2).translate(0.115, 0, 0);
  const cap = latheX([[0.03, 0.128], [0.022, 0.142], [0.001, 0.146]], 12);
  const parts = [hex.toNonIndexed(), cap.toNonIndexed()];
  for (const p of parts) { p.deleteAttribute('uv'); p.deleteAttribute('normal'); }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Brake disc with its bell (hat). */
export function discGeometry(segments: number, outer: number): THREE.BufferGeometry {
  return latheX([[0.075, 0.07], [0.09, 0.05], [0.105, 0.004], [outer, 0.004], [outer, -0.03], [0.105, -0.03]].reverse() as Array<[number, number]>, segments);
}

/**
 * Caliper on the rear of the disc, symmetric about the axle height so that the
 * right-hand wheels (flipped about the wheel's z axis) carry it at the rear too.
 */
export function caliperGeometry(outer: number, rimRadius = RIM_RADIUS): THREE.BufferGeometry {
  const r0 = outer - 0.048;
  const r1 = Math.min(rimRadius - 0.022, outer + 0.024);
  const span = 0.46;
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, -span, span, false);
  s.absarc(0, 0, r0, span, -span, true);
  const body = new THREE.ExtrudeGeometry(s, { depth: 0.088, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.007, bevelSegments: 1, curveSegments: 6 });
  // Bridge bolts: two raised bosses across the back of the caliper.
  const bosses = [-0.2, 0.2].map((a) => new THREE.CylinderGeometry(0.012, 0.012, 0.012, 8).rotateX(Math.PI / 2).translate(Math.cos(a) * (r0 + r1) / 2, Math.sin(a) * (r0 + r1) / 2, 0.094).toNonIndexed());
  const parts = [body.toNonIndexed(), ...bosses];
  for (const p of parts) { p.deleteAttribute('uv'); p.deleteAttribute('normal'); }
  const g = mergeGeometries(parts);
  g.rotateY(Math.PI / 2);
  g.translate(-0.064, 0, 0);
  g.computeVertexNormals();
  return g;
}
