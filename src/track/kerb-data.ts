/** Inside kerbs checked against NSW Spatial Services aerials; see item 3.8 handoff. */
export interface CornerKerb {
  turn: number;
  width: number;
  halfLength: number;
  type: 'flat' | 'raised';
  reference: string;
  /** Aerials establish placement, not height. Profiles are conservative game estimates. */
  heightEstimate: true;
}

export const KERB_CORNERS: readonly CornerKerb[] = [
  { turn: 1, width: 1.05, halfLength: 35, type: 'flat', reference: 'NSW aerial T1 Hell Corner', heightEstimate: true },
  { turn: 2, width: 0.85, halfLength: 35, type: 'flat', reference: 'NSW aerial T2 Griffins Bend', heightEstimate: true },
  { turn: 10, width: 1.05, halfLength: 35, type: 'flat', reference: 'NSW aerial T10 McPhillamy Park', heightEstimate: true },
  // Retain the existing 2 m apron and 65 mm shoulder; this is not a surveyed sausage height.
  { turn: 21, width: 2, halfLength: 38, type: 'raised', reference: 'NSW aerial T21 Chase; official 2024 pole onboard at 1:50', heightEstimate: true },
  { turn: 23, width: 1.05, halfLength: 35, type: 'flat', reference: 'NSW aerial T23 Murrays Corner', heightEstimate: true },
];
