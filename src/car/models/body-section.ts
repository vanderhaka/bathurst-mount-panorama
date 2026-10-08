// Cross-section of the body at a given z: control points from the profile
// curves, then sampled into a fixed number of ring points (same topology for
// every row, so rows can be lofted into one grid).
import { catmullRom, makeCurve, reflect, smoothstep, type Curve, type P2 } from '@/car/models/curves';
import type { BodyCurves, BodyProfile } from '@/car/models/profile-types';

/** Control point indices (half section, bottom centre -> top centre). */
export const CP = { BC: 0, BW: 1, BA: 2, SA: 3, S0: 4, S1: 5, S2: 6, S3: 7, T0: 8, G0: 9, G1: 10, R0: 11, R1: 12, RC: 13 } as const;

/** Samples per span (span i runs from control point i to i+1). */
const SPAN_SAMPLES = {
  high: [2, 1, 1, 1, 2, 3, 3, 2, 2, 2, 2, 3, 4],
  low: [1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 2],
} as const;

export type RingDetail = keyof typeof SPAN_SAMPLES;

export interface SectionLayout {
  /** Half-ring point count minus one (index of RC). */
  n: number;
  /** Half-ring index of each control point. */
  cpIndex: number[];
  spans: readonly number[];
}

export function sectionLayout(detail: RingDetail): SectionLayout {
  const spans = SPAN_SAMPLES[detail];
  const cpIndex = [0];
  for (const k of spans) cpIndex.push(cpIndex[cpIndex.length - 1] + k);
  return { n: cpIndex[cpIndex.length - 1], cpIndex, spans };
}

export type CurveSet = { [K in keyof BodyCurves]-?: Curve };

const ZERO: Curve = () => 0;

export function compileCurves(c: BodyCurves): CurveSet {
  const out: Partial<CurveSet> = { domeH: ZERO, domeW: () => 1 };
  for (const key of Object.keys(c) as Array<keyof BodyCurves>) {
    const knots = c[key];
    if (knots) out[key] = makeCurve(knots);
  }
  return out as CurveSet;
}

export interface ArchInfo { inArch: boolean; lipY: number }

/** Wheel-arch lip height at z (arches are circles around the wheel centres). */
export function archAt(z: number, axles: readonly number[], radius: number, wheelY: number): ArchInfo {
  for (const zw of axles) {
    const dz = z - zw;
    if (Math.abs(dz) <= radius + 1e-6) return { inArch: true, lipY: wheelY + Math.sqrt(Math.max(0, radius * radius - dz * dz)) };
  }
  return { inArch: false, lipY: 0 };
}

/** `soft` (0..1): how much the bonnet edge (G0) rolls smoothly into the top surface instead of creasing.
 *  `edgeT`: box-hump rows only, the R1 -> RC parameter of the hump's top edge (its wall is the first sample step). */
export interface Section { cp: P2[]; top: (x: number) => number; soft: number; edgeNext: P2; sideCrease: boolean; edgeT?: number }

/** Bonnet rows blend from a crisp glass-base crease at the cowl to a smooth fender roll over this length (m). */
const BONNET_ROLL_ZONE = 0.3;
/** Width (m) of the band inside the bonnet edge that is reshaped to meet the shoulder roll smoothly. */
const ROLL_BAND = 0.22;

/** The 14 control points of the left half section at z, plus the top-surface curve. */
export function controlPoints(p: BodyProfile, cv: CurveSet, z: number, arch: ArchInfo): Section {
  const floorY = cv.floorY(z);
  const beltY = cv.beltY(z);
  const maxX = cv.maxX(z);
  let s0y = cv.sillY(z);
  let s0x = cv.sillX(z);
  let lowX = cv.lowX(z);
  if (arch.inArch && arch.lipY > s0y) {
    s0y = arch.lipY;
    s0x = maxX - 0.006;
    lowX = Math.max(lowX, maxX - 0.003);
  }
  const wellX = p.arch.wellX;
  const S3 = { x: cv.shoulderX(z), y: beltY };
  const G0 = { x: cv.glassBaseX(z), y: cv.glassBaseY(z) };
  let G1 = { ...G0 };
  if (z <= p.z.sideFront && z >= p.z.sideRear) G1 = { x: cv.railX(z), y: Math.max(G0.y, cv.railY(z)) };
  const r0x = G1.x - cv.pillarW(z);
  const r1x = Math.min(cv.rearGlassX(z), r0x - 0.03);
  const topY = cv.topY(z);
  const pw = cv.crownPow(z);
  const domeH = cv.domeH(z);
  const domeW = Math.max(0.05, cv.domeW(z));
  // A box hump (ahead of the cowl only): flat top, straight walls `edge` wide; otherwise the smooth bulge.
  const box = p.hump && z > p.z.cowl ? p.hump.edge : 0;
  const dome = box
    ? (x: number) => domeH * Math.max(0, Math.min(1, (domeW - x) / box))
    : (x: number) => domeH * (1 - Math.min(1, (x / domeW) ** 2)) ** 2;
  const base = (x: number) => crownY(topY, G1, pw, x) + dome(x);
  // Ahead of the windscreen there is no glass edge at G0: the shoulder roll runs
  // into the bonnet with a matching slope (no fold line along the bonnet edge).
  const soft = smoothstep(p.z.cowl, p.z.cowl + BONNET_ROLL_ZONE, z);
  const T0 = { x: S3.x - 0.035, y: beltY + 0.028 };
  const qx = G1.x - 0.09;
  const edgeNext = { x: qx, y: base(qx) };
  // Slope of the shoulder-roll spline where it arrives at the bonnet edge.
  const G0p = { x: G0.x, y: G0.y };
  const nearEdge = catmullRom(S3, T0, G0p, edgeNext, 0.97);
  const slopeIn = (G0.y - nearEdge.y) / Math.min(-1e-4, G0.x - nearEdge.x);
  const slopeTop = (base(G1.x) - base(G1.x - 0.002)) / 0.002;
  const k = soft * (slopeIn - slopeTop);
  const top = (x: number) => {
    const w = Math.max(0, 1 - (G1.x - x) / ROLL_BAND);
    return base(x) + k * (x - G1.x) * w * w;
  };
  edgeNext.y = top(qx);
  const cp = [
    { x: 0, y: floorY },
    { x: wellX, y: floorY },
    { x: wellX, y: arch.inArch ? s0y + 0.03 : floorY },
    { x: s0x - 0.035, y: arch.inArch ? s0y + 0.004 : s0y },
    { x: s0x, y: s0y },
    { x: lowX, y: s0y + p.lowFrac * (beltY - s0y) },
    { x: maxX, y: s0y + p.maxFrac * (beltY - s0y) },
    S3,
    T0,
    G0,
    G1,
    { x: r0x, y: top(r0x) },
    { x: r1x, y: top(r1x) },
    { x: 0, y: top(0) },
  ];
  const edgeT = box ? Math.min(0.3, box / Math.max(0.05, r1x)) : undefined;
  return { cp, top, soft, edgeNext, sideCrease: p.sideCrease ?? true, ...(edgeT !== undefined ? { edgeT } : {}) };
}

/** Height of the top surface (bonnet, windscreen, roof, deck) at x, from the roof rail G1 to the centre. */
function crownY(topY: number, g1: P2, crown: number, x: number): number {
  return topY - (topY - g1.y) * Math.pow(Math.max(0, x / g1.x), crown);
}

/** Point at parameter t on span `span` (linear, top-curve or spline depending on the span). */
function spanPoint(cp: P2[], span: number, t: number, top: (x: number) => number, s: Section): P2 {
  const a = cp[span];
  const b = cp[span + 1];
  if (span <= 3 || span === 9) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  if (span >= 10) {
    const x = a.x + (b.x - a.x) * t;
    return { x, y: top(x) };
  }
  // Splines through S0..G0; creases (no tangent bleed) at the sill edge, the
  // side character line (S2), the shoulder (S3) and the glass base (G0).
  const crease = (i: number) => i === CP.S0 || (i === CP.S2 && s.sideCrease) || i === CP.S3 || i === CP.G0;
  const p0 = crease(span) ? reflect(a, b) : cp[span - 1];
  let p3 = crease(span + 1) ? reflect(b, a) : cp[span + 2];
  if (span === CP.T0 && s.soft > 0) {
    const r = reflect(b, a);
    p3 = { x: r.x + (s.edgeNext.x - r.x) * s.soft, y: r.y + (s.edgeNext.y - r.y) * s.soft };
  }
  return catmullRom(p0, a, b, p3, t);
}

/** Sample parameter j of k on a span. On box-hump rows the second sample of the last span (R1 -> RC) sits on the
 *  hump's top edge, so the wall is one sample step and both of its creases fall on ring columns. */
function topT(s: Section, span: number, j: number, k: number): number {
  if (s.edgeT === undefined || span !== CP.R1 || j === 0) return j / k;
  return s.edgeT + ((1 - s.edgeT) * (j - 1)) / Math.max(1, k - 1);
}

/** Samples the half section into layout.n + 1 points (x >= 0). */
export function sampleHalf(section: Section, layout: SectionLayout, out: P2[] = []): P2[] {
  out.length = 0;
  const { cp, top } = section;
  layout.spans.forEach((k, span) => {
    for (let j = 0; j < k; j++) out.push(spanPoint(cp, span, topT(section, span, j, k), top, section));
  });
  out.push({ ...cp[CP.RC] });
  return out;
}
