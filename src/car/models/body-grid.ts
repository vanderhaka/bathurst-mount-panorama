// Lofts the body: rows of cross-sections along z (dense around the wheel
// arches and exactly on the glass edges), closed by rounded nose and tail caps.
// The result is one (rows x cols) grid of points; cols run around the ring:
// bottom centre -> left side -> roof centre -> right side -> bottom centre.
import { lerp, makeCurve, smoothstep, type Curve, type P2 } from '@/car/models/curves';
import { archAt, compileCurves, controlPoints, sampleHalf, sectionLayout, type CurveSet, type RingDetail, type SectionLayout } from '@/car/models/body-section';
import type { BodyProfile, CapSpec } from '@/car/models/profile-types';
import type { CarDimensions } from '@/car/car-specs';

export const ROW_TAIL = 0;
export const ROW_MAIN = 1;
export const ROW_NOSE = 2;

export interface BodyGrid {
  rows: number;
  cols: number;
  /** Half-ring point count minus one; cols = 2n + 1. */
  n: number;
  layout: SectionLayout;
  /** Whether S2 (widest point) is a hard character line. */
  sideCrease: boolean;
  rest: Float32Array;
  rowKind: Uint8Array;
  /** Nominal z of each main row (cap rows: their first point's z). */
  rowZ: Float32Array;
  /** Row index of each greenhouse / cap boundary. */
  /** noseFace: last nose row before the flat front face (the face rows follow it). */
  rowAt: Record<'cowl' | 'roofFront' | 'roofRear' | 'rearGlassBase' | 'sideFront' | 'sideRear' | 'banner' | 'noseStart' | 'noseFace' | 'tailStart', number>;
  /** Box bonnet hump only: rows [from, to) whose hump top edge and foot are hard creases. */
  humpRows?: readonly [number, number];
}

export interface GridOptions { detail: RingDetail; step: number; archRows: number; capRows: number }

interface Ring { pts: P2[]; z: number[] }

function mainStations(p: BodyProfile, dims: CarDimensions, o: GridOptions): { z: number[]; required: number[] } {
  const zf = dims.wheelbase / 2;
  const R = p.arch.radius;
  const required = [p.tail.zStart, p.nose.zStart, p.z.cowl, p.z.roofFront, p.z.roofRear, p.z.rearGlassBase, p.z.sideFront, p.z.sideRear, p.z.banner];
  const fixed = [...required, ...(p.hump?.rows ?? [])];
  for (const zw of [-zf, zf]) {
    for (let i = 0; i < o.archRows; i++) fixed.push(zw + R * Math.sin(-Math.PI / 2 + (Math.PI * i) / (o.archRows - 1)));
    fixed.push(zw - R - 0.006, zw + R + 0.006);
  }
  fixed.sort((a, b) => a - b);
  const z: number[] = [];
  for (const v of fixed) if (!z.length || v - z[z.length - 1] > 0.004) z.push(v);
  const out: number[] = [z[0]];
  for (let i = 1; i < z.length; i++) {
    const gap = z[i] - z[i - 1];
    const k = Math.ceil(gap / o.step - 1e-6);
    for (let j = 1; j < k; j++) out.push(z[i - 1] + (gap * j) / k);
    out.push(z[i]);
  }
  return { z: out, required };
}

/** Raises the outer ends of a full-width spoiler (tail cap `tipLift`), fading down the quarters. */
function liftTips(rest: Float32Array, tail: CapSpec): void {
  const t = tail.tipLift;
  if (!t) return;
  for (let i = 0; i < rest.length; i += 3) {
    const wz = smoothstep(tail.zStart + t.zone, tail.zStart, rest[i + 2]);
    if (wz <= 0) continue;
    const wy = smoothstep(t.yFrom, t.yTo, rest[i + 1]);
    rest[i + 1] += t.lift * wz * wy * smoothstep(t.x0, t.x1, Math.abs(rest[i]));
  }
}

function sweepFn(cap: CapSpec): Curve {
  return (x: number) => cap.sweep * Math.pow(Math.min(1, Math.abs(x)), cap.sweepPow);
}

/** Rings of a cap, from the main boundary outwards to the tip (tip ring collapses to the centre). */
function capRings(half: P2[], cap: CapSpec, sign: 1 | -1, rounding: number, fascia: number): Ring[] {
  const face = makeCurve(cap.face);
  const sweep = sweepFn(cap);
  const cy = cap.centreY;
  let maxX = 0, maxY = -Infinity, minY = Infinity;
  for (const q of half) { maxX = Math.max(maxX, q.x); maxY = Math.max(maxY, q.y); minY = Math.min(minY, q.y); }
  const scale = (theta: number) => {
    const c = 1 - Math.cos(theta);
    return {
      sx: 1 - (cap.roundX * c) / maxX,
      top: 1 - (cap.roundTop * c) / Math.max(0.05, maxY - cy),
      bot: 1 - (cap.roundBottom * c) / Math.max(0.05, cy - minY),
    };
  };
  const rings: Ring[] = [];
  const emit = (sx: number, top: number, bot: number, zOf: (x: number, y: number) => number) => {
    const pts = half.map((q) => ({ x: q.x * sx, y: cy + (q.y - cy) * (q.y >= cy ? top : bot) }));
    rings.push({ pts, z: pts.map((q) => zOf(q.x, q.y)) });
  };
  for (let k = 1; k <= rounding; k++) {
    const th = (k / rounding) * (Math.PI / 2);
    const s = scale(th);
    emit(s.sx, s.top, s.bot, (x, y) => lerp(cap.zStart, face(y), Math.sin(th)) - sign * sweep(x));
  }
  const end = scale(Math.PI / 2);
  for (let j = 1; j <= fascia; j++) {
    const f = 1 - j / fascia;
    emit(end.sx * f, end.top * f, end.bot * f, (x, y) => face(y) - sign * sweep(x));
  }
  return rings;
}

function mainRing(p: BodyProfile, cv: CurveSet, layout: SectionLayout, dims: CarDimensions, z: number): Ring {
  const zf = dims.wheelbase / 2;
  const arch = archAt(z, [-zf, zf], p.arch.radius, dims.wheelRadius);
  const pts = sampleHalf(controlPoints(p, cv, z, arch), layout);
  const sN = sweepFn(p.nose);
  const sT = sweepFn(p.tail);
  const wN = smoothstep(p.nose.zStart - p.nose.sweepZone, p.nose.zStart, z);
  const wT = smoothstep(p.tail.zStart + p.tail.sweepZone, p.tail.zStart, z);
  return { pts, z: pts.map((q) => z - wN * sN(q.x) + wT * sT(q.x)) };
}

export function buildBodyGrid(p: BodyProfile, dims: CarDimensions, o: GridOptions): BodyGrid {
  const layout = sectionLayout(o.detail);
  const cv = compileCurves(p.curves);
  const { z: zs } = mainStations(p, dims, o);
  const main = zs.map((z) => mainRing(p, cv, layout, dims, z));
  const rounding = Math.max(1, Math.ceil(o.capRows * 0.55));
  const fascia = Math.max(1, o.capRows - rounding);
  const nose = capRings(main[main.length - 1].pts, p.nose, 1, rounding, fascia);
  const tail = capRings(main[0].pts, p.tail, -1, rounding, fascia).reverse();
  const rings = [...tail, ...main, ...nose];
  const kinds = [...tail.map(() => ROW_TAIL), ...main.map(() => ROW_MAIN), ...nose.map(() => ROW_NOSE)];
  const n = layout.n;
  const cols = 2 * n + 1;
  const rest = new Float32Array(rings.length * cols * 3);
  rings.forEach((ring, r) => {
    for (let c = 0; c < cols; c++) {
      const h = c <= n ? c : 2 * n - c;
      const i = (r * cols + c) * 3;
      rest[i] = c <= n ? ring.pts[h].x : -ring.pts[h].x;
      rest[i + 1] = ring.pts[h].y;
      rest[i + 2] = ring.z[h];
    }
  });
  liftTips(rest, p.tail);
  const rowZ = Float32Array.from(rings.map((ring, r) => (kinds[r] === ROW_MAIN ? zs[r - tail.length] : ring.z[0])));
  const find = (z: number) => tail.length + zs.reduce((best, v, i) => (Math.abs(v - z) < Math.abs(zs[best] - z) ? i : best), 0);
  const rowAt = {
    cowl: find(p.z.cowl), roofFront: find(p.z.roofFront), roofRear: find(p.z.roofRear), rearGlassBase: find(p.z.rearGlassBase),
    sideFront: find(p.z.sideFront), sideRear: find(p.z.sideRear), banner: find(p.z.banner),
    noseStart: tail.length + zs.length - 1, noseFace: tail.length + zs.length - 1 + rounding, tailStart: tail.length,
  };
  const grid: BodyGrid = { rows: rings.length, cols, n, layout, sideCrease: p.sideCrease ?? true, rest, rowKind: Uint8Array.from(kinds), rowZ, rowAt };
  if (p.hump) {
    const zEnd = Math.max(...p.hump.rows);
    const last = zs.findIndex((z) => z > zEnd + 0.1);
    grid.humpRows = [rowAt.cowl, last < 0 ? rowAt.noseStart : tail.length + last];
  }
  return grid;
}
