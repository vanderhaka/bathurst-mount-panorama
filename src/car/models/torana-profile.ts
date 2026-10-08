import type { BodyProfile, Outline } from '@/car/models/profile-types';

// 1979 Holden Dealer Team LX Torana SS A9X hatchback, #05 (Peter Brock's Hardie-Ferodo winner).
// Visual reference: docs/references/cars-torana.md; physical data: docs/research/car-specs.md
// section 12. Authored in the design frame like the Gen3 profiles and mapped onto the Torana
// dimensions by profile-resolve.ts (x scales by 0.918, z by 0.917 between the axles, 0.92 ahead
// and 0.873 behind them, heights below 0.92 m are unchanged). Notes are in the mapped metres.
//
// A boxy 1970s two-door fastback: a long bonnet with a raised hump in its rear 55 %, flat sides
// with a slight tumblehome above the belt, bolt-on square-cut flares over both axles, a near
// vertical nose with an integral bumper, a deep air dam and round headlamps either side of a
// black egg-crate grille, a flat roof into a fastback hatch, a ducktail lip across the tailgate
// and flat horizontal tail lamps. No wing, splitter, skirts or diffuser; classic 15-inch wheels.
// The A-pillar to windscreen rake and the hatch slope follow the contract's z/y targets (a
// 14 degree average slope; the reference text says 25-30 degrees, which would cut the deck line).

/** Headlamp: an ellipse in design x so it renders round after the 0.918 width scale. */
function lamp(cx: number, cy: number, rx: number, ry: number): Outline {
  return Array.from({ length: 16 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 16;
    return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as const;
  });
}

/** Rounded-rectangle lamp surround (chamfered corners), full outline. */
function surround(cx: number, cy: number, hx: number, hy: number, c: number): Outline {
  return [
    [cx - hx + c, cy - hy], [cx + hx - c, cy - hy], [cx + hx, cy - hy + c], [cx + hx, cy + hy - c],
    [cx + hx - c, cy + hy], [cx - hx + c, cy + hy], [cx - hx, cy + hy - c], [cx - hx, cy - hy + c],
  ];
}

const mirrorX = (o: Outline): Outline => o.map(([x, y]) => [-x, y] as const).reverse();

export const TORANA_PROFILE: BodyProfile = {
  curves: {
    // Floor at the 0.10 m ride height; the nose face runs down to 0.13 (the air dam) and the tail kicks up.
    floorY: [[-2.45, 0.25], [-2.2, 0.2], [-1.9, 0.1], [1.8, 0.1], [2.29, 0.13]],
    sillY: [[-2.45, 0.3], [-2.2, 0.27], [-1.85, 0.25], [-1.0, 0.24], [1.0, 0.24], [1.85, 0.2], [2.29, 0.15]],
    sillX: [[-2.45, 0.865], [-2.0, 0.9], [-1.0, 0.895], [1.0, 0.895], [1.9, 0.9], [2.29, 0.87]],
    // Flat sides at the doors (body 1.70 m); the bolt-on flares step out 5 cm over both axles
    // with a square-cut lip: the width changes within 0.04 m of z at each end of the flare.
    lowX: [[-2.45, 0.89], [-2.0, 0.93], [-1.87, 0.975], [-1.43, 0.98], [-1.03, 0.978], [-0.99, 0.918], [0, 0.916], [0.99, 0.918], [1.03, 0.978], [1.41, 0.98], [1.8, 0.978], [1.86, 0.93], [2.29, 0.9]],
    maxX: [[-2.45, 0.895], [-2.0, 0.935], [-1.87, 0.98], [-1.43, 0.984], [-1.03, 0.982], [-0.99, 0.93], [0, 0.928], [0.99, 0.93], [1.03, 0.982], [1.41, 0.984], [1.8, 0.982], [1.86, 0.935], [2.29, 0.905]],
    // Belt 0.86 m at the doors, rising 3 cm to the quarter window; the front fender top sits just below the bonnet edge.
    beltY: [[-2.45, 0.895], [-2.05, 0.89], [-1.5, 0.885], [-1.0, 0.87], [-0.5, 0.857], [0, 0.855], [0.5, 0.855], [0.93, 0.835], [1.0, 0.82], [1.5, 0.775], [2.0, 0.725], [2.29, 0.7]],
    shoulderX: [[-2.45, 0.87], [-2.0, 0.94], [-1.87, 0.97], [-1.43, 0.972], [-1.03, 0.965], [-0.99, 0.915], [0, 0.912], [0.99, 0.915], [1.03, 0.95], [1.41, 0.955], [1.8, 0.952], [1.86, 0.92], [2.29, 0.89]],
    // Window sill (0.89 m) behind the cowl; ahead of it the bonnet edge: 0.86 m at the cowl, 0.74 m at the nose top edge.
    glassBaseY: [[-2.45, 0.935], [-2.05, 0.925], [-1.704, 0.915], [-1.0, 0.905], [-0.4, 0.9], [0.3, 0.895], [0.93, 0.885], [1.0, 0.865], [1.5, 0.82], [2.0, 0.77], [2.29, 0.745]],
    // The bonnet and the door-front end of the sill are 0.80 wide so the flag mirror (0.19 m outboard of this edge) stays inside the 1.80 m width.
    glassBaseX: [[-2.45, 0.82], [-2.0, 0.86], [-1.704, 0.865], [-1.0, 0.865], [0.3, 0.865], [0.6, 0.85], [0.93, 0.8], [2.29, 0.78]],
    // Framed door window, then a long, low quarter window that tapers to a point along the fastback.
    railY: [[-1.704, 0.916], [-1.45, 0.975], [-1.2, 1.03], [-0.818, 1.105], [-0.491, 1.165], [0.0, 1.17], [0.327, 1.165], [0.5, 1.09], [0.7, 1.0], [0.93, 0.89]],
    railX: [[-1.704, 0.86], [-1.45, 0.8], [-1.2, 0.76], [-0.8, 0.72], [-0.4, 0.705], [0.1, 0.705], [0.4, 0.73], [0.7, 0.775], [0.93, 0.8]],
    // Roof 1.29 m (1.30 less 1 cm so the roll cage's spline overshoot stays inside the 3 % height test), flat from the windscreen top (z 0.30) to z -0.45, a fastback to the hatch base (z -1.85, y 0.93),
    // the short tailgate rising into the ducktail lip, a raked windscreen, then the long bonnet.
    topY: [
      [-2.45, 0.975], [-2.3, 0.955], [-2.2, 0.94], [-2.048, 0.935], [-1.647, 0.995], [-1.2, 1.065], [-0.818, 1.135], [-0.491, 1.19],
      [0.327, 1.19], [0.45, 1.135], [0.62, 1.057], [0.8, 0.97], [0.98, 0.885], [1.0, 0.88], [1.2, 0.865], [1.5, 0.835], [2.0, 0.79], [2.29, 0.765],
    ],
    // Flat crowns with crisp edges on the bonnet and roof sides.
    crownPow: [[-2.45, 2.6], [-2.05, 2.4], [-1.5, 2.6], [-0.49, 3.2], [0.327, 3.0], [0.62, 2.4], [0.98, 3.0], [1.5, 4.0], [2.29, 4.0]],
    pillarW: [[-2.45, 0.06], [0.0, 0.065], [0.6, 0.075], [2.29, 0.06]],
    // Thick C-pillars: the rear glass is narrower than the quarter-window rail.
    rearGlassX: [[-2.45, 0.5], [-2.048, 0.58], [-1.5, 0.62], [-1.0, 0.62], [-0.55, 0.5], [-0.35, 0.36], [2.29, 0.36]],
    // Raised hump in the rear 55 % of the bonnet: +3.5 cm, 0.32 m half-width.
    domeH: [[0.95, 0], [1.04, 0.035], [1.65, 0.035], [1.85, 0]],
    domeW: [[0.95, 0.349], [1.85, 0.349]],
  },
  z: { cowl: 0.98, roofFront: 0.327, roofRear: -0.491, rearGlassBase: -2.048, sideFront: 0.927, sideRear: -1.704, banner: 0.41 },
  nose: {
    // Near-vertical face, an integral bumper and a deep air dam that juts a little ahead of the bonnet edge.
    zStart: 2.29,
    face: [[0.1, 2.395], [0.2, 2.405], [0.35, 2.408], [0.5, 2.408], [0.6, 2.404], [0.7, 2.39], [0.78, 2.375]],
    centreY: 0.45,
    sweep: 0.1,
    sweepPow: 4,
    sweepZone: 0.3,
    roundX: 0.06,
    roundTop: 0.02,
    roundBottom: 0.03,
  },
  tail: {
    // Near-vertical rear panel; the ducktail lip is the rear-most point at the top.
    zStart: -2.42,
    face: [[0.25, -2.515], [0.4, -2.535], [0.6, -2.545], [0.8, -2.552], [0.9, -2.56], [1.0, -2.595]],
    centreY: 0.62,
    sweep: 0.12,
    sweepPow: 4,
    sweepZone: 0.3,
    roundX: 0.05,
    roundTop: 0.015,
    roundBottom: 0.03,
  },
  lowFrac: 0.3,
  maxFrac: 0.66,
  // A crisp waist line along the flat flanks.
  sideCrease: true,
  arch: { radius: 0.395, wellX: 0.62 },
  headlight: {
    // Round lamps, radius 0.085 m, centres x = +/-0.60 m, y = 0.63 m (design x 0.654 after the width scale).
    outline: lamp(0.654, 0.63, 0.0926, 0.085),
  },
  taillight: {
    // Flat horizontal rectangular lamp at each end of the rear panel (x 0.45-0.80 m, y 0.66-0.78 m)
    // split by one thin horizontal divider.
    outline: [[0.49, 0.66], [0.871, 0.66], [0.871, 0.78], [0.49, 0.78]],
    bars: [
      [[0.49, 0.66], [0.871, 0.66], [0.871, 0.714], [0.49, 0.714]],
      [[0.49, 0.726], [0.871, 0.726], [0.871, 0.78], [0.49, 0.78]],
    ],
  },
  art: {
    frontOpenings: [
      // Full-width egg-crate grille between the lamps (x +/-0.44 m, y 0.52-0.68 m).
      [[-0.479, 0.52], [0.479, 0.52], [0.479, 0.68], [-0.479, 0.68]],
      // Brake-duct slots at the lower corners of the air dam.
      [[0.632, 0.17], [0.871, 0.17], [0.871, 0.29], [0.632, 0.29]],
      [[-0.871, 0.17], [-0.632, 0.17], [-0.632, 0.29], [-0.871, 0.29]],
    ],
    frontDepths: [0.07, 0.08, 0.08],
    frontMesh: [[[-0.479, 0.52], [0.479, 0.52], [0.479, 0.68], [-0.479, 0.68]]],
    // Black rounded-rectangle lamp surrounds (centres x +/-0.60 m) and the chin band along the bottom of the air dam.
    frontDark: [
      surround(0.654, 0.63, 0.136, 0.115, 0.03),
      mirrorX(surround(0.654, 0.63, 0.136, 0.115, 0.03)),
      [[-0.85, 0.13], [0.85, 0.13], [0.85, 0.165], [-0.85, 0.165]],
    ],
    // Only the board under the painted rear bumper is black.
    rearPanels: [[[-0.87, 0.24], [0.87, 0.24], [0.87, 0.34], [-0.87, 0.34]]],
    bonnetVents: [],
    // Two doors: from z +0.85 to -0.35 m.
    door: [[0.927, 0.26], [0.932, 0.87], [-0.382, 0.875], [-0.4, 0.26]],
  },
  eye: [-0.392, 1.04, -0.26],
  // Small flag mirror at the front upper corner of the door.
  mirror: { z: 0.95, y: 0.9 },
  // Side exit just ahead of the rear wheel.
  exhaustZ: -0.927,
  sideSkirts: false,
  diffuser: false,
  wheel: { kind: 'classic', rimRadius: 0.1905, rimHalfWidth: 0.127, discRadius: 0.138 },
  cockpit: 'classic',
  canards: [],
};
