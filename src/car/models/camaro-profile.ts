import type { BodyProfile } from '@/car/models/profile-types';

// Gen3 Chevrolet Camaro ZL1 Supercar. Proportions measured from side, front and
// rear photos of the 2022 launch car and 2025 race cars (see
// docs/references/cars-camaro-mustang.md), scaled to CAR_SPECS: low wide nose
// with a high flat bonnet, cabin set well back, high beltline with small side
// glass (chopped look), near-upright rear screen and a long flat deck
// (notchback). Front axle at z = +1.41, rear at -1.41 (design frame).
export const CAMARO_PROFILE: BodyProfile = {
  curves: {
    floorY: [[-2.45, 0.2], [-2.2, 0.16], [-1.9, 0.085], [1.8, 0.085], [2.25, 0.105]],
    sillY: [[-2.45, 0.19], [-2.15, 0.19], [-1.85, 0.17], [-1.0, 0.125], [1.0, 0.125], [1.85, 0.12], [2.25, 0.11]],
    sillX: [[-2.45, 0.86], [-1.9, 0.925], [-1.0, 0.905], [1.0, 0.905], [1.9, 0.925], [2.25, 0.875]],
    // Gen3 flares: the guards step out ~5 cm from the doors around both axles.
    lowX: [[-2.45, 0.9], [-1.95, 0.97], [-1.41, 0.99], [-0.95, 0.98], [-0.8, 0.91], [0, 0.904], [0.8, 0.91], [0.95, 0.972], [1.41, 0.98], [1.95, 0.955], [2.25, 0.905]],
    maxX: [[-2.45, 0.915], [-1.95, 0.98], [-1.41, 0.994], [-0.95, 0.984], [-0.8, 0.918], [0, 0.912], [0.8, 0.918], [0.95, 0.978], [1.41, 0.985], [1.95, 0.968], [2.25, 0.92]],
    // High, flat beltline (chopped look).
    beltY: [[-2.45, 0.94], [-2.0, 0.952], [-1.6, 0.958], [-1.2, 0.938], [-0.9, 0.905], [-0.6, 0.89], [0.0, 0.88], [0.4, 0.865], [1.0, 0.815], [1.6, 0.782], [2.0, 0.76], [2.25, 0.712]],
    shoulderX: [[-2.45, 0.88], [-1.9, 0.948], [-1.41, 0.965], [-1.0, 0.955], [-0.78, 0.9], [0.3, 0.892], [0.78, 0.9], [0.95, 0.928], [1.41, 0.935], [1.9, 0.905], [2.25, 0.865]],
    glassBaseY: [[-2.45, 0.995], [-1.95, 0.996], [-1.2, 0.998], [-0.6, 0.995], [0.08, 0.985], [0.48, 0.965], [0.73, 0.935], [1.05, 0.885], [1.6, 0.84], [2.0, 0.805], [2.25, 0.742]],
    glassBaseX: [[-2.45, 0.8], [-1.95, 0.84], [-1.4, 0.835], [-0.6, 0.795], [0.4, 0.785], [0.7, 0.79], [1.2, 0.8], [1.8, 0.8], [2.25, 0.775]],
    // Short, shallow side glass: rear edge well ahead of the rear wheel.
    railY: [[-0.85, 0.998], [-0.75, 1.07], [-0.55, 1.13], [-0.25, 1.143], [0.08, 1.133], [0.28, 1.085], [0.48, 1.015], [0.63, 0.95]],
    railX: [[-0.85, 0.81], [-0.7, 0.68], [-0.45, 0.63], [0.08, 0.635], [0.38, 0.69], [0.63, 0.785]],
    // Flat roof, near-upright rear screen, then a long flat deck (notchback).
    topY: [
      [-2.45, 1.008], [-2.3, 1.006], [-2.0, 1.004], [-1.6, 1.004], [-1.32, 1.006], [-1.22, 1.035], [-1.1, 1.09], [-0.97, 1.148],
      [-0.87, 1.178], [-0.72, 1.19], [-0.35, 1.196], [-0.1, 1.193], [0.08, 1.18], [0.28, 1.125], [0.48, 1.04], [0.68, 0.95], [0.8, 0.89], [0.98, 0.876],
      [1.3, 0.862], [1.8, 0.83], [2.05, 0.8], [2.25, 0.752],
    ],
    crownPow: [[-2.45, 2.4], [-1.9, 2.2], [-0.9, 2.6], [0.0, 2.4], [0.7, 2.0], [2.25, 2.2]],
    pillarW: [[-2.45, 0.06], [0.0, 0.065], [0.7, 0.07], [2.25, 0.06]],
    rearGlassX: [[-2.45, 0.45], [-1.35, 0.56], [-1.1, 0.54], [-0.88, 0.5], [-0.55, 0.36], [2.25, 0.36]],
  },
  z: { cowl: 0.8, roofFront: 0.08, roofRear: -0.87, rearGlassBase: -1.3, sideFront: 0.63, sideRear: -0.85, banner: 0.152 },
  nose: {
    // Low, wide, flat face that leans back at the top over a jutting chin.
    zStart: 2.27,
    face: [[0.1, 2.375], [0.25, 2.392], [0.4, 2.392], [0.55, 2.378], [0.65, 2.355], [0.75, 2.315]],
    centreY: 0.44,
    sweep: 0.15,
    sweepPow: 3.4,
    sweepZone: 0.38,
    roundX: 0.09,
    // Crisp bonnet leading edge: a tall flat face for the two-tier ZL1 front.
    roundTop: 0.016,
    roundBottom: 0.015,
  },
  tail: {
    zStart: -2.4,
    face: [[0.2, -2.52], [0.3, -2.54], [0.6, -2.552], [0.9, -2.56], [1.0, -2.56]],
    centreY: 0.62,
    sweep: 0.17,
    sweepPow: 3,
    sweepZone: 0.4,
    roundX: 0.07,
    roundTop: 0.015,
    roundBottom: 0.02,
  },
  lowFrac: 0.3,
  maxFrac: 0.66,
  arch: { radius: 0.378, wellX: 0.6 },
  headlight: {
    // Slim lamps in the upper half of the dark upper band, at the corners.
    outline: [[0.46, 0.678], [0.745, 0.68], [0.8, 0.69], [0.818, 0.704], [0.785, 0.708], [0.46, 0.704]],
    bars: [[[0.475, 0.684], [0.75, 0.686], [0.792, 0.695], [0.792, 0.7], [0.75, 0.693], [0.475, 0.692]]],
  },
  taillight: {
    // Twin rectangular lamps per side, side by side, set in the black rear panel
    // that runs across the tail between them.
    outline: [[0.33, 0.84], [0.84, 0.84], [0.855, 0.908], [0.34, 0.908]],
    bars: [
      [[0.36, 0.851], [0.575, 0.851], [0.578, 0.897], [0.362, 0.897]],
      [[0.615, 0.851], [0.826, 0.851], [0.836, 0.897], [0.618, 0.897]],
    ],
  },
  art: {
    frontOpenings: [
      // Gen3 ZL1 face in two tiers. Upper tier (y 0.605-0.712): a dark band that
      // joins the headlamps, with the upper grille above and below a 3 cm
      // body-colour badge bar (no badge). A ~10 cm body-colour bumper band. Lower
      // tier: one wide deep intake with a centre strut; small dark brake ducts.
      [[-0.45, 0.675], [0.45, 0.675], [0.445, 0.712], [-0.445, 0.712]],
      [[-0.45, 0.605], [0.45, 0.605], [0.45, 0.645], [-0.45, 0.645]],
      [[-0.56, 0.215], [0.56, 0.215], [0.63, 0.29], [0.62, 0.505], [-0.62, 0.505], [-0.63, 0.29]],
      [[0.7, 0.25], [0.765, 0.25], [0.775, 0.44], [0.712, 0.46]],
      [[-0.7, 0.25], [-0.712, 0.46], [-0.775, 0.44], [-0.765, 0.25]],
    ],
    frontDepths: [0.05, 0.05, 0.15, 0.12, 0.12],
    // Honeycomb only in the lower intake; the upper grille stays a plain dark slit.
    frontMesh: [
      [[-0.56, 0.215], [0.56, 0.215], [0.63, 0.29], [0.62, 0.505], [-0.62, 0.505], [-0.63, 0.29]],
    ],
    // Lamp surrounds: the band above and below the badge bar runs out to the lamp ends.
    frontDark: [
      [[-0.83, 0.672], [0.83, 0.672], [0.835, 0.714], [-0.835, 0.714]],
      [[-0.79, 0.602], [0.79, 0.602], [0.81, 0.648], [-0.81, 0.648]],
    ],
    intakeStrut: { x: 0, width: 0.04, y0: 0.215, y1: 0.505, depth: 0.15 },
    rearPanels: [
      [[-0.88, 0.832], [0.88, 0.832], [0.9, 0.918], [-0.9, 0.918]],
      [[-0.84, 0.18], [0.84, 0.18], [0.8, 0.34], [-0.8, 0.34]],
    ],
    // One centre extractor on the bonnet.
    bonnetVents: [[[-0.25, 1.4], [0.25, 1.4], [0.22, 1.84], [-0.22, 1.84]]],
    door: [[0.94, 0.17], [0.95, 0.83], [-0.5, 0.87], [-0.62, 0.17]],
  },
  wing: {
    zLE: -2.17, zTE: -2.5, y: 1.135, halfSpan: 0.86, aoa: 0.12,
    endplate: [[-2.11, 1.03], [-2.14, 1.195], [-2.555, 1.2], [-2.56, 1.04]],
    uprightX: 0.42, uprightZ: [-2.36, -2.2],
  },
  eye: [-0.32, 1.045, -0.36],
  mirror: { z: 0.58, y: 0.975 },
  exhaustZ: 0.8,
  // Big Gen3 splitter: the lip reaches well ahead of the bumper and is thick.
  splitter: { reach: 0.14, thickness: 0.036 },
  canards: [[0.3, 0.06], [0.41, 0.05]],
};
