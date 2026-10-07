import type { Knot } from '@/car/models/curves';

/**
 * Blueprint of one body: side-view and plan-view curves along z (model frame,
 * +Z forward, metres) that define the lofted cross-sections, plus the nose and
 * tail caps. Each curve is a list of [z, value] knots (monotone cubic).
 *
 * Section control points per side (bottom centre to top centre):
 *   BC floor centre, BW/BA wheel-well wall, SA/S0 sill (or arch lip),
 *   S1 lower side, S2 widest point, S3 shoulder crease, T0 shoulder roll,
 *   G0 glass base / bonnet & deck edge, G1 roof rail, R0 pillar edge,
 *   R1 rear-glass edge, RC top centre.
 */
export interface BodyCurves {
  floorY: Knot[];
  sillY: Knot[];
  sillX: Knot[];
  lowX: Knot[];
  maxX: Knot[];
  beltY: Knot[];
  shoulderX: Knot[];
  glassBaseY: Knot[];
  glassBaseX: Knot[];
  /** Top of the side glass (only used between sideRear and sideFront). */
  railY: Knot[];
  railX: Knot[];
  topY: Knot[];
  /** Exponent of the cross-section top curve (2 = parabola, higher = flatter centre). */
  crownPow: Knot[];
  /** Width of the A-pillar / roof edge band (m). */
  pillarW: Knot[];
  /** Half-width of the rear glass (R1). */
  rearGlassX: Knot[];
  /** Optional bonnet bulge on the centreline: height (m) and half-width (m) along z. */
  domeH?: Knot[];
  domeW?: Knot[];
}

export interface CapSpec {
  /** z of the last main-loft row at the centreline. */
  zStart: number;
  /** Face position (z) as a function of height y, at the centreline. */
  face: Knot[];
  /** Height of the point the face rings converge to. */
  centreY: number;
  /** Plan-view corner sweep: z offset (m) at |x| = 1 m, power, warp zone length (m). */
  sweep: number;
  sweepPow: number;
  sweepZone: number;
  /** Edge rounding insets (m) of the cap: sideways, top edge, bottom edge. */
  roundX: number;
  roundTop: number;
  roundBottom: number;
}

export interface GreenhouseZ {
  cowl: number;
  roofFront: number;
  roofRear: number;
  rearGlassBase: number;
  sideFront: number;
  sideRear: number;
  /** Lower edge of the windscreen banner. */
  banner: number;
}

/** A closed outline in a 2D projection (metres). */
export type Outline = ReadonlyArray<readonly [number, number]>;

export interface LightSpec {
  /** Outline in the front (x, y) or rear (x, y) view of the LEFT light; mirrored for the right. */
  outline: Outline;
  /** Extra emissive bars inside the housing (tri-bar tail lights, DRL strips). */
  bars?: Outline[];
}

/** Livery-texture features in world coordinates. */
export interface FasciaArt {
  /** Grille and intake openings in the front view (x, y), full outlines (both sides given).
   *  At detail 'high' they are cut through the nose as recesses; at 'low' they are painted. */
  frontOpenings: Outline[];
  /** Recess depth (m) of each front opening. */
  frontDepths: number[];
  /** Honeycomb grille areas (subset of openings drawn with mesh pattern). */
  frontMesh: Outline[];
  /** Painted dark areas on the front face (lamp surrounds, grille band), full outlines. */
  frontDark?: Outline[];
  /** Dark vertical strut across a front opening (detail 'high': real geometry). */
  intakeStrut?: { x: number; width: number; y0: number; y1: number; depth: number };
  /** Black trim panels in the rear view. */
  rearPanels: Outline[];
  /** Louvred bonnet vents in the top view (x, z), full outlines (both sides given). */
  bonnetVents: Outline[];
  /** Door outline in the side view (z, y) for shut lines. */
  door: Outline;
}

export interface WingSpec {
  /** Leading/trailing edge z, height of the chord centre, span half-width. */
  zLE: number;
  zTE: number;
  y: number;
  halfSpan: number;
  /** Angle of attack, rad. */
  aoa: number;
  /** Endplate outline in side view (z, y). */
  endplate: Outline;
  /** Upright x positions (both sides use +/-). */
  uprightX: number;
  /** Deck mounting z range of the uprights. */
  uprightZ: readonly [number, number];
}

export interface BodyProfile {
  curves: BodyCurves;
  z: GreenhouseZ;
  nose: CapSpec;
  tail: CapSpec;
  lowFrac: number;
  maxFrac: number;
  /** Hard character line at the widest point (S2) along the sides (default true). */
  sideCrease?: boolean;
  arch: { radius: number; wellX: number };
  headlight: LightSpec;
  taillight: LightSpec;
  art: FasciaArt;
  wing: WingSpec;
  /** Driver eye (right-hand drive: x < 0). */
  eye: readonly [number, number, number];
  mirror: { z: number; y: number };
  exhaustZ: number;
  /** Front splitter: how far its lip reaches ahead of the nose face (m) and its thickness (m). */
  splitter: { reach: number; thickness: number };
  /** Dive planes on each front bumper corner: [height y, outward reach] per plane. */
  canards: ReadonlyArray<readonly [number, number]>;
}
