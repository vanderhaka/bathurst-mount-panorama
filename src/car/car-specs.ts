// Physical specification of the cars: the three Gen3 Supercars and the 1979 Group C Torana.
// Single source of truth for both the 3D models (dimensions) and the vehicle physics
// (mass, power, aero). Sources: docs/research/car-specs.md.
import { CIRCUITS, type CircuitId } from '@/track/circuits';

export type CarKind = 'camaro' | 'mustang' | 'supra' | 'torana';
/** Per-tyre values in wheel order FL, FR, RL, RR. */
export type WheelGrip = readonly [number, number, number, number];

export interface CarDimensions {
  /** Metres. */
  length: number;
  width: number;
  /** Roof height above ground at static ride height. */
  height: number;
  wheelbase: number;
  trackFront: number;
  trackRear: number;
  /** Tyre outer radius. */
  wheelRadius: number;
  /** Tyre section width. */
  tyreWidth: number;
  /** Front overhang: front axle to front bumper. */
  frontOverhang: number;
  rideHeight: number;
}

export interface EngineSpec {
  label: string;
  displacementL: number;
  /** [rpm, torque Nm] points of the full-throttle torque curve. */
  torqueCurve: ReadonlyArray<readonly [number, number]>;
  idleRpm: number;
  redlineRpm: number;
  limiterRpm: number;
  /** Rotational inertia of engine + flywheel (kg m^2). */
  inertia: number;
  /** Engine-braking torque at the limiter with throttle closed (Nm). */
  engineBrakeNm: number;
  /** Cross-plane V8 = 'crossplane'. Used by the audio synthesiser. */
  crank: 'crossplane' | 'flatplane';
  /** Overhead valve (pushrod) or dual overhead cam. Audio character. */
  valvetrain: 'pushrod' | 'dohc';
}

export interface CarSpec {
  kind: CarKind;
  displayName: string;
  shortName: string;
  dimensions: CarDimensions;
  /** Race weight with driver, kg. */
  massKg: number;
  /** Fraction of static weight on the front axle. */
  frontWeight: number;
  cgHeight: number;
  /** Yaw moment of inertia, kg m^2. */
  yawInertia: number;
  engine: EngineSpec;
  /** Gear ratios 1..6 (index 0 = 1st). */
  gearRatios: readonly number[];
  reverseRatio: number;
  finalDrive: number;
  shiftTimeS: number;
  drivetrainEfficiency: number;
  /** Drag area Cd*A (m^2). */
  cdA: number;
  /** Downforce area Cl*A (m^2), total. */
  clA: number;
  /** Fraction of downforce on the front axle. */
  aeroBalanceFront: number;
  /** Peak tyre friction coefficient (dry, warm slicks). */
  tyreMu: number;
  /**
   * Profile input only: each tyre's friction relative to tyreMu, from the handling tuner's axle split,
   * the setup pressures and the stint's tyre state (handling.ts, setup-forces.ts, stint-spec.ts). Absent = all equal.
   */
  wheelGrip?: WheelGrip;
  maxBrakeTorqueNm: number;
  brakeBiasFront: number;
  /** Max road-wheel steering angle (rad). */
  maxSteerRad: number;
  /**
   * Multiplies the tyre temperature rise from the g-force heat model, so each car's tyre reaches its working
   * window at that car's pace (the model is calibrated on Gen3 cars). Absent = 1. Wear is not scaled.
   */
  tyreHeatGain?: number;
}

// docs/research/car-specs.md: wheelbase 2.766 m (WhichCar), L x W 4.88 x 1.96 m (iRacing
// sheet), 18x11 in wheels with 0.340 m rolling radius. Height and track are estimates.
/** Rated full-throttle torque curves, [rpm, Nm]; each circuit derates them for its altitude. */
const RATED_TORQUE: Record<CarKind, Array<[number, number]>> = {
  // 660 Nm / ~447 kW rated (Supercars).
  camaro: [[1000, 440], [2500, 570], [4000, 645], [5000, 660], [6000, 645], [7000, 605], [7600, 540]],
  // Same rated output (parity), flatter top end from the DOHC heads.
  mustang: [[1000, 400], [2500, 525], [4000, 615], [5000, 655], [6000, 660], [7000, 610], [7600, 555]],
  // Lexus 2UR-GSE based, 94 x 94 mm bore and stroke. Parity rules match its power and
  // torque to the other two across the rev range; the DOHC heads give a Mustang-like top end.
  supra: [[1000, 390], [2500, 515], [4000, 610], [5000, 655], [6000, 660], [7000, 610], [7600, 555]],
  // Holden 308 in 1979 Group C trim, Wheels 1980: 285-290 kW and about 475 Nm; peak rpm estimated
  // (docs/research/car-specs.md section 12).
  torana: [[1000, 190], [1500, 245], [2000, 290], [2500, 335], [3000, 370], [3500, 405], [4000, 432], [4500, 458], [5000, 475], [5500, 472], [6000, 460], [6200, 445], [6500, 410], [6800, 365]],
};
const derate = (curve: Array<[number, number]>, factor: number): Array<[number, number]> => curve.map(([r, t]) => [r, Math.round(t * factor)]);

const GEN3_DIMENSIONS: CarDimensions = {
  length: 4.88,
  width: 1.96,
  height: 1.22,
  wheelbase: 2.766,
  trackFront: 1.64,
  trackRear: 1.63,
  wheelRadius: 0.34,
  tyreWidth: 0.295,
  frontOverhang: 0.98,
  rideHeight: 0.07,
};

/**
 * CG height, estimate (no absolute Gen3 figure is published; Supercars gives only relative data,
 * e.g. Camaro and Mustang 2.3 mm apart). Gen3 was built lower and wider than Gen2 for mechanical
 * grip (100 mm lower roll hoop, 100 mm wider track), and road sports cars on taller suspension
 * sit at 0.40-0.45 m (Alfa 4C, Corvette C7). The tip-over limit track / (2 * h) must stay above
 * the tuned tyre friction (about 1.94), or an ordinary corner lifts the inside wheels.
 */
const GEN3_CG_HEIGHT = 0.38;

/** The cars as raced at Bathurst, where the physics was calibrated. A session uses circuitCarSpec. */
export const CAR_SPECS: Record<CarKind, CarSpec> = {
  camaro: {
    kind: 'camaro',
    displayName: 'Chevrolet Camaro ZL1 (Gen3 Supercar)',
    shortName: 'Camaro ZL1',
    // Overall height per make (docs/research/car-specs.md section 1: Camaro ~1.29 m, Mustang ~1.33 m).
    dimensions: { ...GEN3_DIMENSIONS, height: 1.29 },
    massKg: 1400,
    frontWeight: 0.53,
    cgHeight: GEN3_CG_HEIGHT,
    yawInertia: 2400,
    engine: {
      label: '5.7 L pushrod V8',
      displacementL: 5.7,
      torqueCurve: derate(RATED_TORQUE.camaro, CIRCUITS.bathurst.altitudeDerate),
      idleRpm: 1150,
      redlineRpm: 7400,
      limiterRpm: 7500,
      inertia: 0.18,
      engineBrakeNm: 90,
      crank: 'crossplane',
      valvetrain: 'pushrod',
    },
    gearRatios: [2.86, 2.11, 1.64, 1.34, 1.1, 0.94],
    reverseRatio: 2.9,
    finalDrive: 3.36,
    shiftTimeS: 0.105, // Camaro upshift torque cut (Autosport, May 2023)
    drivetrainEfficiency: 0.92,
    cdA: 1.0,
    clA: 0.89,
    aeroBalanceFront: 0.47,
    tyreMu: 1.62,
    maxBrakeTorqueNm: 4200,
    brakeBiasFront: 0.6,
    maxSteerRad: 0.36,
  },
  mustang: {
    kind: 'mustang',
    displayName: 'Ford Mustang GT (Gen3 Supercar)',
    shortName: 'Mustang GT',
    dimensions: { ...GEN3_DIMENSIONS, height: 1.33 },
    massKg: 1400,
    frontWeight: 0.53,
    cgHeight: GEN3_CG_HEIGHT,
    yawInertia: 2400,
    engine: {
      label: '5.4 L DOHC V8',
      displacementL: 5.4,
      torqueCurve: derate(RATED_TORQUE.mustang, CIRCUITS.bathurst.altitudeDerate),
      idleRpm: 1250,
      redlineRpm: 7400,
      limiterRpm: 7500,
      inertia: 0.16,
      engineBrakeNm: 95,
      crank: 'crossplane',
      valvetrain: 'dohc',
    },
    gearRatios: [2.86, 2.11, 1.64, 1.34, 1.1, 0.94],
    reverseRatio: 2.9,
    finalDrive: 3.36,
    shiftTimeS: 0.045, // Mustang upshift torque cut
    drivetrainEfficiency: 0.92,
    cdA: 1.0,
    clA: 0.89,
    aeroBalanceFront: 0.47,
    tyreMu: 1.62,
    maxBrakeTorqueNm: 4200,
    brakeBiasFront: 0.6,
    maxSteerRad: 0.36,
  },
  // 2026 entry (docs/research/car-specs.md section 6): same control chassis, driveline
  // and aero targets as the other two; Toyota body and a 5.2 L quad-cam V8.
  supra: {
    kind: 'supra',
    displayName: 'Toyota GR Supra (Gen3 Supercar)',
    shortName: 'GR Supra',
    // No published overall height (estimate): the road A90 is 1,292-1,295 mm, the lowest of
    // the three road cars, less the ~65 mm used for the other two (docs/research/car-specs.md).
    dimensions: { ...GEN3_DIMENSIONS, height: 1.23 },
    massKg: 1400,
    frontWeight: 0.53,
    cgHeight: GEN3_CG_HEIGHT,
    yawInertia: 2400,
    engine: {
      label: '5.2 L quad-cam V8',
      displacementL: 5.2,
      torqueCurve: derate(RATED_TORQUE.supra, CIRCUITS.bathurst.altitudeDerate),
      idleRpm: 1200,
      redlineRpm: 7400,
      limiterRpm: 7500,
      inertia: 0.15,
      engineBrakeNm: 95,
      crank: 'crossplane',
      valvetrain: 'dohc',
    },
    gearRatios: [2.86, 2.11, 1.64, 1.34, 1.1, 0.94],
    reverseRatio: 2.9,
    finalDrive: 3.36,
    shiftTimeS: 0.045, // no published figure: the short torque cut of the other DOHC car (Mustang)
    drivetrainEfficiency: 0.92,
    cdA: 1.0,
    clA: 0.89,
    aeroBalanceFront: 0.47,
    tyreMu: 1.62,
    maxBrakeTorqueNm: 4200,
    brakeBiasFront: 0.6,
    maxSteerRad: 0.36,
  },
  // 1979 Group C tribute car (docs/research/car-specs.md section 12). Values marked "estimate" are
  // reasoned there; the tyre friction is a first value that a later calibration tunes to the lap target.
  torana: {
    kind: 'torana',
    displayName: 'Holden Torana A9X (1979 Group C)',
    shortName: 'Torana A9X',
    // Length, wheelbase confirmed; width with flares, height, track, overhang and ride height are estimates.
    dimensions: { length: 4.51, width: 1.8, height: 1.3, wheelbase: 2.586, trackFront: 1.54, trackRear: 1.52, wheelRadius: 0.31, tyreWidth: 0.27, frontOverhang: 0.92, rideHeight: 0.1 },
    massKg: 1300, // estimate: stripped shell plus cage and drop tank
    frontWeight: 0.52, // estimate: front V8, low rear tank
    cgHeight: 0.42, // estimate: taller than Gen3, under the tip-over limit
    yawInertia: 1900, // estimate, scaled from the Gen3 value by mass and length
    engine: {
      label: '5.0 L pushrod V8',
      displacementL: 5.0,
      torqueCurve: derate(RATED_TORQUE.torana, CIRCUITS.bathurst.altitudeDerate),
      idleRpm: 1100, // estimate: big-cam idle
      redlineRpm: 6500,
      limiterRpm: 6800, // rules limit
      inertia: 0.2, // estimate: heavier flywheel than Gen3
      engineBrakeNm: 70, // estimate
      crank: 'crossplane',
      valvetrain: 'pushrod',
    },
    // Borg-Warner Super T10. One of the two sets CAMS homologated for the A9X (2.43 and 2.64 first gears;
    // gmh-torana.com forum, "Borg Warner Super T10", 2008); which one #05 ran at Bathurst in 1979 is not recorded.
    gearRatios: [2.43, 1.61, 1.23, 1.0],
    reverseRatio: 2.35, // the same 2.43 set in the Richmond Gear Super T10 catalogue (RG25)
    // Salisbury axle: "2.6:1 final drive Bathurst" and 44.8 km/h per 1000 rpm (QTCC LX specifications). Disputed:
    // the 1979 team manager later thought 2.78 "maybe"; kept at 2.60 (user decision, 2026-10-08).
    finalDrive: 2.6,
    shiftTimeS: 0.3, // estimate: manual clutch and lever
    drivetrainEfficiency: 0.9, // estimate
    cdA: 1.05, // calibrated: Conrod top speed inside the 249-269 km/h trap range, with margin (tests/torana-pace.test.ts)
    clA: 0,
    aeroBalanceFront: 0.5,
    tyreMu: 1.21, // calibrated: LINE_PROFILE lap at MEASURED = R x 145.5 s (tests/torana-pace.test.ts)
    maxBrakeTorqueNm: 2500, // estimate
    brakeBiasFront: 0.62, // estimate
    maxSteerRad: 0.4, // estimate
    tyreHeatGain: 1.5, // calibrated: lap-1 tyre temperature at The Cutting about 4.5 C under the Camaro's; 3-lap peak below it; higher gains put the race-warm colour driver into the wall (tests/line-follower.test.ts)
  },
};

const circuitSpecs = new Map<string, CarSpec>();

/** The car at a circuit: its altitude derate on the rated torque, everything else as CAR_SPECS (Bathurst is CAR_SPECS itself). */
export function circuitCarSpec(kind: CarKind, circuit: CircuitId): CarSpec {
  const factor = CIRCUITS[circuit].altitudeDerate;
  if (factor === CIRCUITS.bathurst.altitudeDerate) return CAR_SPECS[kind];
  const key = `${kind}|${circuit}`;
  let spec = circuitSpecs.get(key);
  if (!spec) {
    const base = CAR_SPECS[kind];
    spec = { ...base, engine: { ...base.engine, torqueCurve: derate(RATED_TORQUE[kind], factor) } };
    circuitSpecs.set(key, spec);
  }
  return spec;
}
