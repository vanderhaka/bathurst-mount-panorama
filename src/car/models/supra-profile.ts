import type { BodyProfile } from '@/car/models/profile-types';

// Gen3 Toyota GR Supra Supercar (A90 based). Proportions from the 2025 launch car,
// the January 2026 race-spec renders and the A90 road car (docs/references/cars-supra.md):
// low pointed "boat nose" with a three-part lower intake split by a V, slim swept
// lamps high on bulging front guards with the bonnet sunk between them, a very
// raked screen and a cabin set well back under a double-bubble roof, a teardrop
// side window, wide rear haunches and a short rounded tail with a ducktail lip.
export const SUPRA_PROFILE: BodyProfile = {
  curves: {
    floorY: [[-2.45, 0.2], [-2.2, 0.16], [-1.9, 0.085], [1.8, 0.085], [2.25, 0.1]],
    sillY: [[-2.45, 0.19], [-2.15, 0.19], [-1.85, 0.17], [-1.0, 0.125], [1.0, 0.125], [1.85, 0.115], [2.25, 0.1]],
    sillX: [[-2.45, 0.86], [-1.9, 0.925], [-1.0, 0.9], [1.0, 0.9], [1.9, 0.925], [2.25, 0.86]],
    // Narrow waist at the doors between big flares; the rear haunches are the widest point.
    lowX: [[-2.45, 0.86], [-2.2, 0.95], [-1.95, 0.985], [-1.41, 0.994], [-0.95, 0.975], [-0.75, 0.9], [0, 0.893], [0.8, 0.905], [0.95, 0.968], [1.41, 0.978], [1.95, 0.95], [2.25, 0.88]],
    maxX: [[-2.45, 0.87], [-2.2, 0.962], [-1.95, 0.992], [-1.41, 0.998], [-0.95, 0.985], [-0.75, 0.91], [0, 0.9], [0.8, 0.912], [0.95, 0.975], [1.41, 0.984], [1.95, 0.962], [2.25, 0.9]],
    // Low door line that sweeps up over the rear wheels into the haunches.
    beltY: [[-2.45, 0.93], [-2.2, 0.955], [-1.9, 0.96], [-1.6, 0.95], [-1.41, 0.93], [-1.0, 0.865], [-0.6, 0.815], [0.0, 0.795], [0.4, 0.79], [1.0, 0.78], [1.41, 0.765], [1.6, 0.75], [1.9, 0.72], [2.25, 0.66]],
    shoulderX: [[-2.45, 0.84], [-2.2, 0.93], [-1.9, 0.972], [-1.41, 0.975], [-1.0, 0.95], [-0.7, 0.88], [0.0, 0.862], [0.7, 0.875], [0.95, 0.925], [1.41, 0.94], [1.9, 0.915], [2.25, 0.85]],
    // In front of the screen G0 is the crest of the front guards; the bonnet sits below it.
    glassBaseY: [[-2.45, 0.965], [-2.2, 0.968], [-1.9, 0.982], [-1.6, 1.0], [-1.3, 0.995], [-1.0, 0.955], [-0.6, 0.91], [-0.2, 0.885], [0.2, 0.868], [0.42, 0.86], [0.8, 0.85], [1.3, 0.848], [1.6, 0.828], [2.0, 0.78], [2.25, 0.72]],
    glassBaseX: [[-2.45, 0.74], [-2.0, 0.8], [-1.6, 0.825], [-1.2, 0.8], [-0.6, 0.755], [0.0, 0.76], [0.42, 0.76], [1.0, 0.74], [1.6, 0.72], [2.25, 0.66]],
    // Teardrop side glass: the top follows the roof down, the base rises to meet it at a point.
    railY: [[-1.05, 0.962], [-0.98, 1.025], [-0.9, 1.075], [-0.8, 1.11], [-0.6, 1.135], [-0.4, 1.145], [-0.2, 1.11], [0.0, 1.035], [0.2, 0.94], [0.34, 0.866]],
    railX: [[-1.05, 0.788], [-0.95, 0.7], [-0.8, 0.64], [-0.4, 0.615], [-0.1, 0.625], [0.15, 0.68], [0.34, 0.755]],
    // Long low bonnet, very raked screen, arched roof, short fastback glass and a
    // short deck that kicks up into the ducktail lip.
    topY: [
      [-2.45, 1.01], [-2.38, 1.0], [-2.28, 0.963], [-2.1, 0.955], [-1.95, 0.976], [-1.85, 0.996], [-1.7, 1.035], [-1.4, 1.09], [-1.1, 1.14], [-0.85, 1.174],
      [-0.6, 1.192], [-0.4, 1.192], [-0.18, 1.14], [0.0, 1.065], [0.2, 0.968], [0.42, 0.86], [0.8, 0.81], [1.2, 0.765],
      [1.6, 0.715], [2.0, 0.65], [2.25, 0.585],
    ],
    crownPow: [[-2.45, 3.0], [-2.0, 3.0], [-1.75, 2.2], [-0.6, 2.4], [0.0, 2.2], [0.42, 2.6], [1.0, 3.0], [2.25, 3.0]],
    pillarW: [[-2.45, 0.06], [0.0, 0.065], [0.4, 0.07], [2.25, 0.06]],
    rearGlassX: [[-2.45, 0.42], [-1.85, 0.44], [-1.3, 0.47], [-1.0, 0.44], [-0.85, 0.36], [2.25, 0.36]],
    // Raised centre panel on the bonnet; a shallow channel down the roof (the double bubble).
    domeH: [[-2.0, 0], [-1.6, -0.026], [-0.35, -0.036], [-0.1, 0], [0.42, 0], [0.7, 0.022], [2.0, 0.022], [2.25, 0.006]],
    domeW: [[-1.6, 0.26], [-0.15, 0.26], [0.42, 0.3], [2.25, 0.3]],
  },
  z: { cowl: 0.42, roofFront: -0.12, roofRear: -0.85, rearGlassBase: -1.85, sideFront: 0.34, sideRear: -1.05, banner: -0.045 },
  nose: {
    // Pointed "boat nose": the beak juts forward at mid height, the bonnet slopes back above it.
    zStart: 2.22,
    face: [[0.08, 2.27], [0.2, 2.31], [0.32, 2.365], [0.42, 2.402], [0.49, 2.415], [0.55, 2.4], [0.61, 2.34], [0.68, 2.25]],
    centreY: 0.45,
    sweep: 0.33,
    sweepPow: 1.7,
    sweepZone: 0.42,
    roundX: 0.1,
    roundTop: 0.03,
    roundBottom: 0.015,
  },
  tail: {
    // Short, rounded tail; the ducktail lip is the rear-most point at the top.
    zStart: -2.4,
    face: [[0.2, -2.43], [0.35, -2.5], [0.55, -2.54], [0.75, -2.55], [0.9, -2.55], [1.0, -2.575]],
    centreY: 0.62,
    sweep: 0.3,
    sweepPow: 1.9,
    sweepZone: 0.5,
    roundX: 0.11,
    roundTop: 0.012,
    roundBottom: 0.02,
  },
  lowFrac: 0.3,
  maxFrac: 0.62,
  // Smooth flanks: the haunches and the shoulder carry the shape.
  sideCrease: false,
  arch: { radius: 0.378, wellX: 0.6 },
  headlight: {
    // Small projector at the inner end of a slim swept lamp; a long LED swoosh under it.
    outline: [[0.57, 0.6], [0.63, 0.606], [0.65, 0.622], [0.635, 0.638], [0.575, 0.632], [0.56, 0.616]],
    bars: [[[0.3, 0.532], [0.5, 0.556], [0.7, 0.586], [0.84, 0.612], [0.895, 0.652], [0.88, 0.666], [0.83, 0.626], [0.7, 0.6], [0.5, 0.57], [0.3, 0.546]]],
  },
  taillight: {
    // Slim boomerang lamps high in the haunches, wrapping round the tail corners.
    outline: [[0.34, 0.83], [0.58, 0.842], [0.76, 0.862], [0.86, 0.885], [0.86, 0.95], [0.76, 0.94], [0.56, 0.905], [0.35, 0.87]],
    bars: [
      [[0.37, 0.856], [0.57, 0.882], [0.76, 0.91], [0.845, 0.922], [0.845, 0.94], [0.76, 0.93], [0.56, 0.898], [0.37, 0.866]],
      [[0.39, 0.838], [0.58, 0.85], [0.75, 0.87], [0.845, 0.89], [0.845, 0.905], [0.74, 0.887], [0.58, 0.866], [0.4, 0.848]],
    ],
  },
  art: {
    frontOpenings: [
      // Three-part lower intake: a centre mouth inside the body-colour V under the beak,
      // two wide side openings, and tall ducts at the bumper corners.
      [[0, 0.4], [0.12, 0.15], [-0.12, 0.15]],
      [[0.075, 0.43], [0.4, 0.44], [0.62, 0.455], [0.69, 0.48], [0.7, 0.3], [0.66, 0.15], [0.19, 0.15]],
      [[-0.075, 0.43], [-0.19, 0.15], [-0.66, 0.15], [-0.7, 0.3], [-0.69, 0.48], [-0.62, 0.455], [-0.4, 0.44]],
      [[0.735, 0.17], [0.79, 0.19], [0.8, 0.5], [0.75, 0.52]],
      [[-0.735, 0.17], [-0.75, 0.52], [-0.8, 0.5], [-0.79, 0.19]],
    ],
    frontDepths: [0.15, 0.13, 0.13, 0.08, 0.08],
    frontMesh: [
      [[0.075, 0.43], [0.4, 0.44], [0.62, 0.455], [0.69, 0.48], [0.7, 0.3], [0.66, 0.15], [0.19, 0.15]],
      [[-0.075, 0.43], [-0.19, 0.15], [-0.66, 0.15], [-0.7, 0.3], [-0.69, 0.48], [-0.62, 0.455], [-0.4, 0.44]],
    ],
    // Dark swept lamp housings (the lenses and LED strips sit inside them).
    frontDark: [
      [[0.28, 0.522], [0.5, 0.54], [0.7, 0.574], [0.86, 0.62], [0.925, 0.66], [0.91, 0.705], [0.78, 0.688], [0.6, 0.65], [0.42, 0.6], [0.29, 0.56]],
      [[-0.28, 0.522], [-0.29, 0.56], [-0.42, 0.6], [-0.6, 0.65], [-0.78, 0.688], [-0.91, 0.705], [-0.925, 0.66], [-0.86, 0.62], [-0.7, 0.574], [-0.5, 0.54]],
    ],
    rearPanels: [
      // Black lower bumper and diffuser surround that rises at the corners.
      [[-0.86, 0.18], [0.86, 0.18], [0.86, 0.46], [0.6, 0.415], [-0.6, 0.415], [-0.86, 0.46]],
    ],
    // The twin bonnet vents of the A90, opened up as heat extractors.
    bonnetVents: [
      [[0.18, 1.38], [0.36, 1.38], [0.34, 1.58], [0.2, 1.58]],
      [[-0.18, 1.38], [-0.2, 1.58], [-0.34, 1.58], [-0.36, 1.38]],
    ],
    door: [[0.9, 0.17], [0.92, 0.78], [-0.6, 0.8], [-0.74, 0.17]],
  },
  wing: {
    zLE: -2.2, zTE: -2.52, y: 1.17, halfSpan: 0.86, aoa: 0.1,
    endplate: [[-2.13, 1.05], [-2.12, 1.205], [-2.56, 1.215], [-2.57, 1.07]],
    uprightX: 0.38, uprightZ: [-2.38, -2.24],
  },
  eye: [-0.32, 1.02, -0.46],
  mirror: { z: 0.26, y: 0.93 },
  exhaustZ: 0.8,
  splitter: { reach: 0.1, thickness: 0.03 },
  canards: [[0.33, 0.07]],
};
