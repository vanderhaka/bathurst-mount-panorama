// Per-distance layout of Mount Panorama. Crossfall sign: bank + = LEFT side higher.
// Off-camber in a left turn = bank > 0; off-camber in a right turn = bank < 0.
// s = metres along the OSM centreline
// from the Murray's end of Pit Straight, in race direction.
// Barrier offsets come from real OSM walls (see scripts/build-features.mjs);
// this file supplies paved widths, crossfall, fallbacks where OSM has no wall,
// tyre walls and catch fences. Source: docs/research/circuit-facts.md.

export type VergeSurface = 'grass' | 'gravel' | 'asphalt' | 'concrete';
export type BarrierKind = 'concrete' | 'tyres' | 'armco' | 'none';

export interface WidthKey {
  s: number;
  /** Paved width (m). */
  width: number;
  /** Crossfall: + = left side higher (rad). */
  bank: number;
  /** Fallback distance road edge -> barrier where OSM has no wall (m). */
  vergeL: number;
  vergeR: number;
  /** Default verge surface when there is no sand trap. */
  surfaceL?: VergeSurface;
  surfaceR?: VergeSurface;
}

/** Paved widths: ~8.5-9.5 m across the top, 12-14 m on the straights (wall-to-wall minus verges). */
export const WIDTH_KEYS: WidthKey[] = [
  { s: 0, width: 14, bank: 0, vergeL: 1.2, vergeR: 3, surfaceL: 'asphalt' },
  { s: 420, width: 13, bank: -0.025, vergeL: 3, vergeR: 12 }, // Hell Corner (left): helpful camber, outside (right) higher
  { s: 560, width: 12, bank: 0, vergeL: 8, vergeR: 2.5 },
  { s: 1480, width: 11.5, bank: 0, vergeL: 2.5, vergeR: 2.5 },
  { s: 1600, width: 10.5, bank: -0.06, vergeL: 3, vergeR: 2 }, // Griffins Bend (right): off-camber, outside (left) lower
  { s: 1780, width: 9, bank: 0.01, vergeL: 1.2, vergeR: 1.2 }, // The Cutting
  { s: 2200, width: 9.2, bank: 0, vergeL: 1.5, vergeR: 1.5 }, // Quarry, Reid Park
  { s: 2560, width: 9.6, bank: 0, vergeL: 1.8, vergeR: 1.8 }, // Sulman Park
  { s: 2900, width: 10, bank: 0.01, vergeL: 2, vergeR: 6 }, // McPhillamy Park
  { s: 3300, width: 9.4, bank: 0, vergeL: 1.4, vergeR: 1.4 }, // Skyline
  { s: 3450, width: 8.8, bank: 0, vergeL: 3, vergeR: 1.2 }, // The Esses
  { s: 3600, width: 8.6, bank: 0.045, vergeL: 1.2, vergeR: 1.2 }, // The Dipper (left): off-camber, outside (right) lower
  { s: 3700, width: 9, bank: 0, vergeL: 1.3, vergeR: 1.3 },
  { s: 3940, width: 9.6, bank: 0.05, vergeL: 1.5, vergeR: 2 }, // Forrest's Elbow (left): adverse camber, outside lower
  { s: 4080, width: 12.5, bank: 0, vergeL: 2, vergeR: 2 }, // Conrod Straight
  { s: 5280, width: 13, bank: 0, vergeL: 3, vergeR: 3 }, // The Chase
  { s: 5760, width: 12.5, bank: 0, vergeL: 4, vergeR: 3 },
  { s: 6120, width: 13.5, bank: 0.01, vergeL: 6, vergeR: 10 }, // Murray's Corner
];

/** Ranges with a belt-covered tyre wall in front of the concrete. side: 1 = left, -1 = right. */
export const TYRE_WALLS: Array<{ from: number; to: number; side: 1 | -1 }> = [
  { from: 470, to: 560, side: -1 }, // Hell Corner outside
  { from: 1560, to: 1700, side: 1 }, // Griffins Bend "Corner 2"
  { from: 3590, to: 3660, side: -1 }, // The Dipper outside (2017)
  { from: 3990, to: 4070, side: -1 }, // Forrest's Elbow exit
  { from: 5560, to: 5690, side: 1 }, // Chase kink sand-trap end
  { from: 5610, to: 5800, side: -1 }, // Chase T21, in front of Rydges
  { from: 6140, to: 6213, side: -1 }, // Murray's outside
  { from: 0, to: 45, side: -1 },
];

/** Catch-fence ranges in addition to OSM fences. side: 1 = left, -1 = right. */
export const CATCH_FENCES: Array<{ from: number; to: number; side: 1 | -1 }> = [
  { from: 0, to: 430, side: 1 }, // pit wall debris fence
  { from: 0, to: 430, side: -1 }, // Pit Straight spectator fencing
  { from: 2440, to: 4060, side: -1 }, // Reid Park -> Forrest's Elbow, right
  { from: 3560, to: 3700, side: 1 }, // Dipper
];

/** The 23 turns (Supercars numbering; T7-T17 medium confidence). s = apex region start. */
export const CORNERS: Array<{ turn: number; name: string; s: number; dir: 'L' | 'R' }> = [
  { turn: 1, name: 'Hell Corner', s: 441, dir: 'L' },
  { turn: 2, name: 'Griffins Bend', s: 1557, dir: 'R' },
  { turn: 3, name: 'The Cutting', s: 1968, dir: 'L' },
  { turn: 4, name: 'The Cutting', s: 2063, dir: 'L' },
  { turn: 5, name: 'Quarry Corner', s: 2208, dir: 'R' },
  { turn: 6, name: 'Reid Park', s: 2388, dir: 'R' },
  { turn: 7, name: 'Reid Park', s: 2504, dir: 'L' },
  { turn: 8, name: 'Sulman Park', s: 2654, dir: 'L' },
  { turn: 9, name: 'Sulman Park', s: 2764, dir: 'L' },
  { turn: 10, name: 'McPhillamy Park', s: 3039, dir: 'L' },
  { turn: 11, name: "Brock's Skyline", s: 3390, dir: 'R' },
  { turn: 12, name: 'The Esses', s: 3455, dir: 'L' },
  { turn: 13, name: 'The Esses', s: 3525, dir: 'R' },
  { turn: 14, name: 'The Dipper', s: 3605, dir: 'L' },
  { turn: 15, name: 'The Esses', s: 3655, dir: 'R' },
  { turn: 16, name: 'The Esses', s: 3770, dir: 'L' },
  { turn: 17, name: 'The Esses', s: 3841, dir: 'R' },
  { turn: 18, name: "Forrest's Elbow", s: 3951, dir: 'L' },
  { turn: 19, name: 'Conrod Straight', s: 4206, dir: 'L' },
  { turn: 20, name: 'The Chase', s: 5323, dir: 'R' },
  { turn: 21, name: 'The Chase', s: 5588, dir: 'L' },
  { turn: 22, name: 'The Chase', s: 5668, dir: 'R' },
  { turn: 23, name: "Murray's Corner", s: 6159, dir: 'L' },
];

/** Names shown to the driver by distance. */
export const NAMED_PLACES: Array<{ s: number; name: string }> = [
  { s: 0, name: 'Pit Straight' },
  { s: 430, name: 'Hell Corner' },
  { s: 520, name: 'Mountain Straight' },
  { s: 1540, name: 'Griffins Bend' },
  { s: 1760, name: 'The Cutting' },
  { s: 2190, name: 'Quarry Corner' },
  { s: 2300, name: 'Reid Park' },
  { s: 2600, name: 'Sulman Park' },
  { s: 2900, name: 'McPhillamy Park' },
  { s: 3200, name: "Brock's Skyline" },
  { s: 3440, name: 'The Esses' },
  { s: 3590, name: 'The Dipper' },
  { s: 3650, name: 'The Esses' },
  { s: 3910, name: "Forrest's Elbow" },
  { s: 4060, name: 'Conrod Straight' },
  { s: 5280, name: 'The Chase' },
  { s: 5760, name: 'Conrod Straight' },
  { s: 6120, name: "Murray's Corner" },
];

/**
 * Sector 2 and sector 3 start distances. Matches the published ~41 % / 27 % / 32 %
 * split (docs/research/car-specs.md): S1 ends after The Cutting, S2 at Forrest's Elbow.
 */
export const SECTOR_STARTS_S = [2545, 4065];
