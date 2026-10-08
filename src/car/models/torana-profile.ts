import type { BodyProfile, Outline } from '@/car/models/profile-types';

// 1979 Holden Dealer Team LX Torana SS A9X hatchback, #05 (Peter Brock's Hardie-Ferodo winner).
// Visual reference: docs/references/cars-torana.md; physical data: docs/research/car-specs.md
// section 12. Authored in the design frame like the Gen3 profiles and mapped onto the Torana
// dimensions by profile-resolve.ts (x scales by 0.918, z by 0.917 between the axles, 0.92 ahead
// and 0.873 behind them, heights below 0.92 m are unchanged). Notes are in the mapped metres.
//
// A boxy 1970s two-door hatchback: a bonnet 1.2 m long with a raised hump in its rear half, flat
// sides with a slight tumblehome above the belt, bolt-on square-cut flares over both axles, a near
// vertical nose with an integral bumper, a deep air dam and round headlamps either side of a
// black egg-crate grille. The roof is flat from the windscreen back over the rear seat, then a
// 25 degree hatch glass between thick C-pillars (the rear glass is much narrower than the roof)
// drops to a short deck and a full-width spoiler lip, with flat horizontal tail lamps below.
// No wing, splitter, skirts or diffuser; classic 15-inch wheels.

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
    // Flat sides at the doors (body 1.66 m); the bolt-on flares step out 7 cm over both axles. Each flare
    // ramps out from its joint with the body (about 0.11 m outside the arch, by the door shut lines) to the
    // full width at the arch, where a rolled lip (flares, below) finishes the opening.
    lowX: [[-2.45, 0.9], [-2.0, 0.93], [-1.87, 0.975], [-1.43, 0.98], [-1.03, 0.978], [-0.92, 0.9], [0, 0.898], [0.92, 0.9], [1.03, 0.978], [1.41, 0.98], [1.8, 0.978], [1.86, 0.93], [2.29, 0.9]],
    maxX: [[-2.45, 0.905], [-2.0, 0.935], [-1.87, 0.98], [-1.43, 0.984], [-1.03, 0.982], [-0.92, 0.912], [0, 0.91], [0.92, 0.912], [1.03, 0.982], [1.41, 0.984], [1.8, 0.982], [1.86, 0.935], [2.29, 0.905]],
    // Belt 0.86 m at the doors, rising 3 cm to the quarter window; the front fender top sits just below the bonnet edge.
    beltY: [[-2.45, 0.87], [-2.05, 0.85], [-1.5, 0.83], [-1.0, 0.81], [-0.5, 0.79], [0, 0.785], [0.5, 0.785], [0.93, 0.79], [1.1, 0.8], [1.5, 0.765], [2.0, 0.725], [2.29, 0.7]],
    // The top of each flare starts closer to the axle than its foot, so the lip follows the arch.
    shoulderX: [[-2.45, 0.9], [-2.0, 0.94], [-1.93, 0.945], [-1.82, 0.97], [-1.43, 0.972], [-1.22, 0.965], [-1.14, 0.905], [0, 0.9], [1.06, 0.905], [1.14, 0.95], [1.41, 0.955], [1.72, 0.952], [1.82, 0.92], [2.29, 0.89]],
    // Window sill (0.89 m) behind the cowl, rising to the deck edge at the tail; ahead of the cowl the bonnet edge: 0.865 m at the cowl, 0.77 m at the nose top edge.
    glassBaseY: [[-2.45, 0.975], [-2.3, 0.955], [-2.15, 0.935], [-1.95, 0.905], [-1.5, 0.87], [-1.0, 0.845], [-0.4, 0.825], [0.3, 0.82], [0.93, 0.825], [1.1, 0.835], [1.5, 0.82], [2.0, 0.79], [2.29, 0.77]],
    // The bonnet and the door-front end of the sill are 0.80 wide so the flag mirror (0.19 m outboard of this edge) stays inside the 1.80 m width.
    glassBaseX: [[-2.45, 0.86], [-2.15, 0.865], [-1.704, 0.865], [-1.0, 0.865], [0.3, 0.865], [0.6, 0.85], [0.93, 0.8], [2.29, 0.78]],
    // Framed door window, then a long, low quarter window that tapers to a point along the hatch.
    railY: [[-1.95, 0.915], [-1.8, 0.975], [-1.6, 1.045], [-1.2, 1.15], [-1.0, 1.18], [-0.5, 1.18], [0.0, 1.18], [0.45, 1.175], [0.6, 1.16], [0.7, 1.09], [0.8, 1.02], [0.93, 0.91]],
    railX: [[-1.95, 0.86], [-1.6, 0.8], [-1.2, 0.74], [-1.0, 0.715], [-0.4, 0.705], [0.1, 0.705], [0.45, 0.73], [0.75, 0.775], [0.93, 0.8]],
    // Roof 1.29 m (1.30 less 1 cm so the roll cage's spline overshoot stays inside the 3 % height test), flat from the windscreen top (z 0.40)
    // back over the rear seat to z -1.2, then a 25 degree hatch glass down to the deck (z -2.15, y 0.935), a short deck rising into the spoiler lip,
    // a raked windscreen and the long bonnet.
    topY: [
      [-2.45, 1.0], [-2.42, 1.0], [-2.36, 0.965], [-2.3, 0.94], [-2.15, 0.935], [-1.8, 1.03], [-1.5, 1.105], [-1.2, 1.19], [-0.6, 1.19],
      [0.6, 1.19], [0.7, 1.12], [0.8, 1.06], [0.9, 1.0], [1.0, 0.925], [1.1, 0.845], [1.3, 0.84], [1.5, 0.83], [2.0, 0.81], [2.29, 0.795],
    ],
    // Flat crowns with crisp edges on the bonnet, roof and the full-width spoiler.
    crownPow: [[-2.45, 4.0], [-2.3, 4.0], [-2.15, 3.2], [-1.6, 3.0], [-1.0, 3.2], [-0.49, 3.2], [0.4, 3.0], [0.7, 2.4], [1.06, 3.0], [1.5, 4.0], [2.29, 4.0]],
    pillarW: [[-2.45, 0.07], [-1.2, 0.09], [-0.6, 0.065], [0.6, 0.075], [2.29, 0.06]],
    // Thick C-pillars: the rear glass is much narrower than the quarter-window rail. On the bonnet this is the foot
    // of the hump (equal to domeW, see hump below).
    rearGlassX: [[-2.45, 0.7], [-2.15, 0.72], [-1.8, 0.71], [-1.2, 0.62], [-0.9, 0.5], [-0.6, 0.36], [0.9, 0.36], [1.1, 0.33], [1.6, 0.32], [1.68, 0.29], [1.73, 0.22], [1.76, 0.19], [2.29, 0.19]],
    // Bolt-on box hump from the windscreen base forward over about 48 % of the bonnet (1979 museum car, road A9X):
    // 0.59 m wide, 8 cm tall, a flat top, a near-vertical rear face (the scoop opening) and a rounded front ramp.
    domeH: [[1.1, 0], [1.112, 0], [1.128, 0.085], [1.6, 0.085], [1.66, 0.072], [1.71, 0.042], [1.75, 0]],
    domeW: [[1.1, 0.33], [1.6, 0.32], [1.68, 0.29], [1.73, 0.22], [1.76, 0.19]],
  },
  z: { cowl: 1.1, roofFront: 0.6, roofRear: -1.2, rearGlassBase: -2.15, sideFront: 0.927, sideRear: -1.95, banner: 0.68 },
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
    face: [[0.25, -2.515], [0.4, -2.535], [0.6, -2.545], [0.8, -2.552], [0.94, -2.557], [0.965, -2.585], [1.0, -2.59]],
    centreY: 0.62,
    sweep: 0.08,
    sweepPow: 4,
    sweepZone: 0.3,
    roundX: 0.03,
    roundTop: 0.01,
    roundBottom: 0.03,
    // Three-piece spoiler: the bolt-on end caps rise about 6 cm above the centre lip at the corners and wrap down
    // the rear quarters as a triangle above the tail lamps (rear photos of the HDT cars).
    tipLift: { lift: 0.07, x0: 0.6, x1: 0.8, zone: 0.25, yFrom: 0.82, yTo: 0.97 },
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
    // Flat horizontal rectangular lamp at each end of the rear panel (x 0.45-0.80 m, y 0.66-0.78 m) in a black
    // bezel, crossed by one black bar just above mid-height. From the inboard end: a narrow red cell, the main
    // red section, then amber over the outboard 45 % (rear photos of the HDT cars and a road LX).
    outline: [[0.49, 0.66], [0.871, 0.66], [0.871, 0.78], [0.49, 0.78]],
    bars: [
      [[0.49, 0.66], [0.532, 0.66], [0.532, 0.722], [0.49, 0.722]],
      [[0.49, 0.734], [0.532, 0.734], [0.532, 0.78], [0.49, 0.78]],
      [[0.542, 0.66], [0.7, 0.66], [0.7, 0.722], [0.542, 0.722]],
      [[0.542, 0.734], [0.7, 0.734], [0.7, 0.78], [0.542, 0.78]],
    ],
    amber: [
      [[0.7, 0.66], [0.871, 0.66], [0.871, 0.722], [0.7, 0.722]],
      [[0.7, 0.734], [0.871, 0.734], [0.871, 0.78], [0.7, 0.78]],
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
    door: [[0.927, 0.26], [0.932, 0.795], [-0.382, 0.8], [-0.4, 0.26]],
  },
  eye: [-0.392, 1.04, -0.26],
  // Small black flag mirror at the front upper corner of the door.
  mirror: { z: 0.95, y: 0.84, colour: 0x151515 },
  // Side exit just ahead of the rear wheel.
  exhaustZ: -0.927,
  sideSkirts: false,
  diffuser: false,
  // Black louvred vent between the door glass and the quarter window, and two bonnet pins near the front corners
  // (side and front photos of the HDT cars).
  quarterLouvre: { width: 0.16, slats: 6 },
  bonnetPins: { x: 0.33, z: 2.22 },
  hump: { edge: 0.035, scoopZ: 1.12, rows: [1.106, 1.112, 1.128, 1.138, 1.6, 1.66, 1.71, 1.75], rivets: 7 },
  // Rolled lip, about 6-7 dome bolts per front arch and a black joint line (front-flare photo).
  flares: { lip: 0.045, proud: 0.022, bolts: 7, boltR: 0.075, jointR: 0.115 },
  wheel: { kind: 'classic', rimRadius: 0.1905, rimHalfWidth: 0.127, discRadius: 0.138 },
  cockpit: 'classic',
  canards: [],
};
