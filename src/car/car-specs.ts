// Physical specification of the two Gen3 Supercars. Single source of truth for
// both the 3D models (dimensions) and the vehicle physics (mass, power, aero).
// Sources: docs/research/car-specs.md.

export type CarKind = 'camaro' | 'mustang';

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
  maxBrakeTorqueNm: number;
  brakeBiasFront: number;
  /** Max road-wheel steering angle (rad). */
  maxSteerRad: number;
}

// docs/research/car-specs.md: wheelbase 2.766 m (WhichCar), L x W 4.88 x 1.96 m (iRacing
// sheet), 18x11 in wheels with 0.340 m rolling radius. Height and track are estimates.
/** Bathurst altitude power derate (docs/research/car-specs.md). */
const ALTITUDE_DERATE = 0.92;
const derate = (curve: Array<[number, number]>): Array<[number, number]> => curve.map(([r, t]) => [r, Math.round(t * ALTITUDE_DERATE)]);

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

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  camaro: {
    kind: 'camaro',
    displayName: 'Chevrolet Camaro ZL1 (Gen3 Supercar)',
    shortName: 'Camaro ZL1',
    // Overall height per make (docs/research/car-specs.md section 1: Camaro ~1.29 m, Mustang ~1.33 m).
    dimensions: { ...GEN3_DIMENSIONS, height: 1.29 },
    massKg: 1400,
    frontWeight: 0.53,
    cgHeight: 0.44,
    yawInertia: 2400,
    engine: {
      label: '5.7 L pushrod V8',
      displacementL: 5.7,
      // 660 Nm / ~447 kW rated (Supercars), x0.92 for Bathurst altitude (700-870 m).
      torqueCurve: derate([[1000, 440], [2500, 570], [4000, 645], [5000, 660], [6000, 645], [7000, 605], [7600, 540]]),
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
    cgHeight: 0.44,
    yawInertia: 2400,
    engine: {
      label: '5.4 L DOHC V8',
      displacementL: 5.4,
      // Same rated output (parity), flatter top end from the DOHC heads.
      torqueCurve: derate([[1000, 400], [2500, 525], [4000, 615], [5000, 655], [6000, 660], [7000, 610], [7600, 555]]),
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
};
