// The body blueprints are authored in a fixed design frame. This maps them onto
// the live CAR_SPECS dimensions (wheelbase, overhangs, height, width, wheel
// radius), so a spec change re-proportions the car without editing the data.
import type { CarDimensions } from '@/car/car-specs';
import { smoothstep, type Knot } from '@/car/models/curves';
import type { BodyCurves, BodyProfile, CapSpec, FasciaArt, LightSpec, Outline, WingSpec } from '@/car/models/profile-types';

/** Dimensions the profile data was authored against. */
export const DESIGN_FRAME = { wheelbase: 2.82, frontOverhang: 1.0, rearOverhang: 1.15, height: 1.2, width: 1.96, wheelRadius: 0.343 } as const;

/**
 * Design-frame height where the greenhouse stretch starts (just above the
 * beltline). Everything below it (sills, arches, beltline, bonnet, lamps, wheels)
 * keeps its authored height; the difference between the spec height and the
 * design height goes into the side glass, pillars and roof, blended in smoothly
 * so the windscreen and rear screen keep a clean line.
 */
const GREENHOUSE_FROM = 0.92;

export interface FrameMap { z: (z: number) => number; y: (y: number) => number; x: (x: number) => number; sz: number }

export function frameMap(d: CarDimensions): FrameMap {
  const D = DESIGN_FRAME;
  const zf = D.wheelbase / 2;
  const kWb = d.wheelbase / D.wheelbase;
  const kF = d.frontOverhang / D.frontOverhang;
  const kR = (d.length - d.wheelbase - d.frontOverhang) / D.rearOverhang;
  const extra = d.height - D.height;
  const sx = d.width / D.width;
  return {
    z: (z) => (z >= zf ? d.wheelbase / 2 + (z - zf) * kF : z <= -zf ? -d.wheelbase / 2 + (z + zf) * kR : z * kWb),
    y: (y) => y + extra * smoothstep(GREENHOUSE_FROM, D.height, y),
    x: (x) => x * sx,
    sz: (kF + kR) / 2,
  };
}

const zKnots = (k: Knot[], m: FrameMap, v: (n: number) => number): Knot[] => k.map(([z, n]) => [m.z(z), v(n)] as const);
const xy = (o: Outline, m: FrameMap): Outline => o.map(([x, y]) => [m.x(x), m.y(y)] as const);
const xz = (o: Outline, m: FrameMap): Outline => o.map(([x, z]) => [m.x(x), m.z(z)] as const);
const zy = (o: Outline, m: FrameMap): Outline => o.map(([z, y]) => [m.z(z), m.y(y)] as const);

function curves(c: BodyCurves, m: FrameMap): BodyCurves {
  const X = (k: Knot[]) => zKnots(k, m, m.x);
  const Y = (k: Knot[]) => zKnots(k, m, m.y);
  return {
    floorY: Y(c.floorY), sillY: Y(c.sillY), sillX: X(c.sillX), lowX: X(c.lowX), maxX: X(c.maxX),
    beltY: Y(c.beltY), shoulderX: X(c.shoulderX), glassBaseY: Y(c.glassBaseY), glassBaseX: X(c.glassBaseX),
    railY: Y(c.railY), railX: X(c.railX), topY: Y(c.topY), crownPow: zKnots(c.crownPow, m, (v) => v),
    pillarW: X(c.pillarW), rearGlassX: X(c.rearGlassX),
    ...(c.domeH && c.domeW ? { domeH: Y(c.domeH), domeW: X(c.domeW) } : {}),
  };
}

function cap(c: CapSpec, m: FrameMap): CapSpec {
  return {
    ...c,
    zStart: m.z(c.zStart),
    face: c.face.map(([y, z]) => [m.y(y), m.z(z)] as const),
    centreY: m.y(c.centreY),
    sweep: c.sweep * m.sz,
    sweepZone: c.sweepZone * m.sz,
    roundX: m.x(c.roundX),
    roundTop: m.y(c.roundTop),
    roundBottom: m.y(c.roundBottom),
  };
}

const light = (l: LightSpec, m: FrameMap): LightSpec => ({ outline: xy(l.outline, m), bars: l.bars?.map((b) => xy(b, m)) });

function art(a: FasciaArt, m: FrameMap): FasciaArt {
  return {
    frontOpenings: a.frontOpenings.map((o) => xy(o, m)),
    frontDepths: a.frontDepths.map((d) => d * m.sz),
    frontMesh: a.frontMesh.map((o) => xy(o, m)),
    ...(a.frontDark ? { frontDark: a.frontDark.map((o) => xy(o, m)) } : {}),
    ...(a.intakeStrut ? { intakeStrut: { ...a.intakeStrut, x: m.x(a.intakeStrut.x), y0: m.y(a.intakeStrut.y0), y1: m.y(a.intakeStrut.y1), depth: a.intakeStrut.depth * m.sz } } : {}),
    rearPanels: a.rearPanels.map((o) => xy(o, m)),
    bonnetVents: a.bonnetVents.map((o) => xz(o, m)),
    door: zy(a.door, m),
  };
}

function wing(w: WingSpec, m: FrameMap): WingSpec {
  return {
    ...w,
    zLE: m.z(w.zLE), zTE: m.z(w.zTE), y: m.y(w.y), halfSpan: m.x(w.halfSpan),
    endplate: zy(w.endplate, m), uprightX: m.x(w.uprightX), uprightZ: [m.z(w.uprightZ[0]), m.z(w.uprightZ[1])],
  };
}

/** Maps a design-frame profile onto the given car dimensions. */
export function resolveProfile(p: BodyProfile, d: CarDimensions): BodyProfile {
  const m = frameMap(d);
  const gz = p.z;
  return {
    curves: curves(p.curves, m),
    z: {
      cowl: m.z(gz.cowl), roofFront: m.z(gz.roofFront), roofRear: m.z(gz.roofRear), rearGlassBase: m.z(gz.rearGlassBase),
      sideFront: m.z(gz.sideFront), sideRear: m.z(gz.sideRear), banner: m.z(gz.banner),
    },
    nose: cap(p.nose, m),
    tail: cap(p.tail, m),
    lowFrac: p.lowFrac,
    sideCrease: p.sideCrease ?? true,
    maxFrac: p.maxFrac,
    arch: { radius: p.arch.radius - DESIGN_FRAME.wheelRadius + d.wheelRadius, wellX: m.x(p.arch.wellX) },
    headlight: light(p.headlight, m),
    taillight: light(p.taillight, m),
    art: art(p.art, m),
    wing: wing(p.wing, m),
    // The seat does not move when the greenhouse grows: the eye keeps its design height
    // (the extra height becomes headroom and taller glass).
    eye: [m.x(p.eye[0]), p.eye[1], m.z(p.eye[2])],
    mirror: { z: m.z(p.mirror.z), y: m.y(p.mirror.y) },
    exhaustZ: m.z(p.exhaustZ),
    splitter: { reach: p.splitter.reach * m.sz, thickness: p.splitter.thickness },
    canards: p.canards.map(([y, reach]) => [m.y(y), m.x(reach)] as const),
  };
}
