import type { BodyProfile } from '@/car/models/profile-types';

// Gen3 Ford Mustang GT (S650) Supercar. Proportions from the 2022 reveal renders
// and 2025 race-car photos (docs/references/cars-camaro-mustang.md): long bonnet,
// forward-leaning "shark nose" with a wide trapezoid grille, fastback roofline
// that runs into a short ducktail deck, tri-bar tail lights.
export const MUSTANG_PROFILE: BodyProfile = {
  curves: {
    floorY: [[-2.45, 0.2], [-2.2, 0.16], [-1.9, 0.085], [1.8, 0.085], [2.25, 0.1]],
    sillY: [[-2.45, 0.19], [-2.15, 0.19], [-1.85, 0.17], [-1.0, 0.125], [1.0, 0.125], [1.85, 0.115], [2.25, 0.1]],
    sillX: [[-2.45, 0.86], [-1.9, 0.925], [-1.0, 0.905], [1.0, 0.905], [1.9, 0.925], [2.25, 0.87]],
    // Gen3 flares: the guards step out ~5 cm from the doors around both axles.
    lowX: [[-2.45, 0.9], [-1.95, 0.965], [-1.41, 0.98], [-0.95, 0.972], [-0.8, 0.91], [0, 0.904], [0.8, 0.91], [0.95, 0.972], [1.41, 0.98], [1.95, 0.955], [2.25, 0.9]],
    maxX: [[-2.45, 0.915], [-1.95, 0.975], [-1.41, 0.985], [-0.95, 0.978], [-0.8, 0.918], [0, 0.912], [0.8, 0.918], [0.95, 0.978], [1.41, 0.985], [1.95, 0.966], [2.25, 0.915]],
    // Beltline rises to high rear haunches (short, high-shouldered boot).
    beltY: [[-2.45, 0.955], [-2.0, 0.958], [-1.6, 0.94], [-1.2, 0.888], [-0.6, 0.835], [0.4, 0.8], [1.0, 0.778], [1.6, 0.758], [2.25, 0.735]],
    shoulderX: [[-2.45, 0.885], [-1.9, 0.94], [-1.41, 0.95], [-0.95, 0.938], [-0.78, 0.902], [0.3, 0.895], [0.78, 0.9], [0.95, 0.925], [1.41, 0.93], [1.9, 0.9], [2.25, 0.86]],
    glassBaseY: [[-2.45, 1.01], [-2.0, 1.012], [-1.7, 0.995], [-1.45, 0.968], [-1.0, 0.94], [-0.5, 0.912], [0.18, 0.885], [0.43, 0.872], [0.75, 0.838], [1.0, 0.822], [1.6, 0.797], [2.25, 0.77]],
    glassBaseX: [[-2.45, 0.81], [-1.9, 0.85], [-1.3, 0.84], [-0.6, 0.8], [0.3, 0.79], [0.6, 0.795], [1.2, 0.8], [1.8, 0.79], [2.25, 0.77]],
    // Long side glass whose top follows the fastback down to a point at the rear.
    railY: [[-1.45, 0.97], [-1.25, 1.005], [-1.0, 1.058], [-0.7, 1.113], [-0.42, 1.152], [-0.2, 1.165], [-0.02, 1.148], [0.13, 1.08], [0.28, 0.998], [0.43, 0.873]],
    railX: [[-1.45, 0.84], [-1.15, 0.73], [-0.7, 0.655], [-0.12, 0.64], [0.18, 0.7], [0.43, 0.795]],
    // Fastback: the roof slopes in one continuous line to a short ducktail deck.
    topY: [
      [-2.45, 1.03], [-2.38, 1.022], [-2.2, 1.015], [-2.0, 1.025], [-1.75, 1.05], [-1.45, 1.085], [-1.15, 1.123], [-0.85, 1.158],
      [-0.6, 1.183], [-0.35, 1.198], [-0.2, 1.196], [-0.02, 1.165], [0.18, 1.07], [0.33, 0.975], [0.5, 0.874], [0.7, 0.866], [1.0, 0.86], [1.3, 0.85],
      // Bonnet centre sits just above its edges (gently convex, no valley beside the bulge).
      [1.7, 0.828], [2.0, 0.806], [2.25, 0.784],
    ],
    crownPow: [[-2.45, 2.6], [-1.75, 2.0], [-0.6, 2.6], [-0.02, 2.4], [0.5, 2.0], [2.25, 2.2]],
    pillarW: [[-2.45, 0.06], [0.0, 0.065], [0.6, 0.07], [2.25, 0.06]],
    rearGlassX: [[-2.45, 0.45], [-1.95, 0.58], [-1.5, 0.6], [-1.0, 0.57], [-0.6, 0.5], [-0.35, 0.36], [2.25, 0.36]],
    // Power bulge down the middle of the bonnet.
    domeH: [[0.56, 0], [0.85, 0.024], [1.9, 0.028], [2.25, 0.01]],
    domeW: [[0.56, 0.3], [2.25, 0.3]],
  },
  z: { cowl: 0.5, roofFront: -0.02, roofRear: -0.5, rearGlassBase: -1.92, sideFront: 0.43, sideRear: -1.45, banner: 0.065 },
  nose: {
    // High "shark nose": the face leans forward at the top and is pointed in plan.
    zStart: 2.25,
    face: [[0.08, 2.3], [0.2, 2.31], [0.32, 2.325], [0.45, 2.35], [0.56, 2.385], [0.66, 2.415], [0.74, 2.43]],
    centreY: 0.42,
    sweep: 0.27,
    sweepPow: 2.4,
    sweepZone: 0.4,
    roundX: 0.1,
    roundTop: 0.028,
    roundBottom: 0.015,
  },
  tail: {
    zStart: -2.4,
    face: [[0.25, -2.5], [0.4, -2.535], [0.7, -2.55], [0.95, -2.56], [1.0, -2.56]],
    centreY: 0.62,
    sweep: 0.2,
    sweepPow: 2.6,
    sweepZone: 0.42,
    roundX: 0.08,
    roundTop: 0.012,
    roundBottom: 0.02,
  },
  lowFrac: 0.3,
  maxFrac: 0.66,
  // Smooth, full flanks: the fender's character comes from the shoulder line only.
  sideCrease: false,
  arch: { radius: 0.378, wellX: 0.6 },
  headlight: {
    // Slim lamps over three vertical light bars, outside the tall grille.
    outline: [[0.5, 0.602], [0.795, 0.62], [0.815, 0.652], [0.53, 0.638]],
    bars: [
      [[0.585, 0.545], [0.605, 0.545], [0.618, 0.592], [0.598, 0.592]],
      [[0.65, 0.55], [0.67, 0.55], [0.683, 0.597], [0.663, 0.597]],
      [[0.715, 0.555], [0.735, 0.555], [0.748, 0.602], [0.728, 0.602]],
    ],
  },
  taillight: {
    // Three tall vertical bars per side.
    outline: [[0.47, 0.8], [0.82, 0.8], [0.835, 0.952], [0.49, 0.952]],
    bars: [
      [[0.51, 0.812], [0.566, 0.812], [0.576, 0.94], [0.52, 0.94]],
      [[0.616, 0.812], [0.672, 0.812], [0.682, 0.94], [0.626, 0.94]],
      [[0.722, 0.812], [0.778, 0.812], [0.788, 0.94], [0.732, 0.94]],
    ],
  },
  art: {
    frontOpenings: [
      // Tall trapezoid upper grille, wider at the bottom, set high in the face.
      [[-0.56, 0.345], [0.56, 0.345], [0.43, 0.675], [-0.43, 0.675]],
      // Separate lower intake below the body-colour bar.
      [[-0.44, 0.15], [0.44, 0.15], [0.47, 0.29], [-0.47, 0.29]],
      // Small corner intakes.
      [[0.56, 0.16], [0.73, 0.16], [0.745, 0.27], [0.58, 0.29]],
      [[-0.56, 0.16], [-0.58, 0.29], [-0.745, 0.27], [-0.73, 0.16]],
    ],
    frontDepths: [0.12, 0.1, 0.07, 0.07],
    frontMesh: [
      [[-0.56, 0.345], [0.56, 0.345], [0.43, 0.675], [-0.43, 0.675]],
      [[-0.44, 0.15], [0.44, 0.15], [0.47, 0.29], [-0.47, 0.29]],
    ],
    rearPanels: [
      [[-0.84, 0.18], [0.84, 0.18], [0.8, 0.34], [-0.8, 0.34]],
    ],
    // Two heat extractors on the flanks of the bonnet bulge.
    // One centre heat extractor on the front of the bonnet bulge.
    bonnetVents: [[[-0.19, 1.24], [0.19, 1.24], [0.17, 1.6], [-0.17, 1.6]]],
    door: [[0.86, 0.17], [0.88, 0.81], [-0.66, 0.86], [-0.78, 0.17]],
  },
  wing: {
    zLE: -2.2, zTE: -2.5, y: 1.17, halfSpan: 0.86, aoa: 0.1,
    endplate: [[-2.14, 1.06], [-2.12, 1.21], [-2.555, 1.215], [-2.56, 1.09]],
    uprightX: 0.4, uprightZ: [-2.38, -2.22],
  },
  eye: [-0.32, 1.02, -0.46],
  mirror: { z: 0.32, y: 0.945 },
  exhaustZ: 0.8,
  splitter: { reach: 0.065, thickness: 0.022 },
  canards: [[0.3, 0.075]],
};
