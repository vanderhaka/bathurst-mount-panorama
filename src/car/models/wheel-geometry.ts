// Wheel parts in the wheel frame: axle along X, outer face towards +X, centre
// at the origin. Tyre and rim barrel are lathed profiles; the rim face is made
// of real tapered, dished spokes; the brake disc and caliper sit inside.
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

function spokeGeometry(count: number, high: boolean, rimRadius: number, halfWidth: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const steps = high ? 3 : 1;
  const rIn = 0.068;
  const rOut = rimRadius - 0.012;
  for (let s = 0; s < count; s++) {
    const ang = (s / count) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const base = pos.length / 3;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const r = rIn + (rOut - rIn) * t;
      const w = 0.086 + (halfWidth - 0.006 - 0.086) * Math.pow(t, 0.7);
      const half = (0.025 - 0.01 * t) * (high ? 1 : 1.25);
      const depth = 0.03;
      // Four corners: front-left, front-right, back-right, back-left (tangent, lateral).
      for (const [tan, lat] of [[-half, 0], [half, 0], [half * 1.15, -depth], [-half * 1.15, -depth]] as const) {
        pos.push(w + lat, r * ca - tan * sa, r * sa + tan * ca);
      }
    }
    for (let k = 0; k < steps; k++) {
      const a = base + k * 4;
      const b = a + 4;
      // front face, side 1 (corners 1-2), side 2 (corners 3-0)
      idx.push(a, b + 1, a + 1, a, b, b + 1);
      idx.push(a + 1, b + 2, a + 2, a + 1, b + 1, b + 2);
      idx.push(a + 3, b, a, a + 3, b + 3, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

/** Rim: outer lip, inner barrel (seen through the spokes), dished spokes and hub. */
export function rimGeometry(segments: number, spokes: number, high: boolean, style: WheelStyle = GEN3_WHEEL): THREE.BufferGeometry {
  const R = style.rimRadius;
  const W = style.rimHalfWidth;
  const barrel = latheX(
    high
      ? [[R + 0.01, -W], [R - 0.016, -W + 0.02], [R - 0.02, 0.06], [R - 0.014, W - 0.012], [R - 0.004, W + 0.004], [R + 0.013, W + 0.002], [R + 0.014, W - 0.01]]
      : [[R - 0.018, -W + 0.02], [R - 0.016, W - 0.01], [R + 0.012, W + 0.002]],
    segments,
  );
  const hub = latheX(high ? [[0.074, 0.06], [0.072, 0.088], [0.058, 0.1], [0.03, 0.104], [0.001, 0.104]] : [[0.07, 0.08], [0.001, 0.1]], Math.max(10, segments / 2));
  const parts = [barrel.toNonIndexed(), hub.toNonIndexed(), spokeGeometry(spokes, high, R, W)];
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

/** Caliper straddling the top of the disc (symmetric, so it works on both sides). */
export function caliperGeometry(outer: number, rimRadius = RIM_RADIUS): THREE.BufferGeometry {
  const r0 = outer - 0.045;
  const r1 = Math.min(rimRadius - 0.024, outer + 0.022);
  const span = 0.42;
  const s = new THREE.Shape();
  s.absarc(0, 0, r1, Math.PI / 2 - span, Math.PI / 2 + span, false);
  s.absarc(0, 0, r0, Math.PI / 2 + span, Math.PI / 2 - span, true);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.085, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: 5 });
  g.rotateY(Math.PI / 2);
  g.translate(-0.062, 0, 0);
  g.deleteAttribute('uv');
  return g;
}
