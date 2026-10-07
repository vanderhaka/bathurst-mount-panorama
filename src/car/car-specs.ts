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

const GEN3_DIMENSIONS: CarDimensions = {
  length: 4.97,
  width: 1.96,
  height: 1.2,
  wheelbase: 2.82,
  trackFront: 1.69,
  trackRear: 1.69,
  wheelRadius: 0.343,
  tyreWidth: 0.28,
  frontOverhang: 1.0,
  rideHeight: 0.07,
};

export const CAR_SPECS: Record<CarKind, CarSpec> = {
  camaro: {
    kind: 'camaro',
    displayName: 'Chevrolet Camaro ZL1 (Gen3 Supercar)',
    shortName: 'Camaro ZL1',
    dimensions: { ...GEN3_DIMENSIONS },
    massKg: 1395,
    frontWeight: 0.52,
    cgHeight: 0.42,
    yawInertia: 2050,
    engine: {
      label: '5.7 L pushrod V8',
      displacementL: 5.7,
      torqueCurve: [[1000, 420], [2500, 520], [4000, 600], [5000, 640], [5800, 650], [6500, 625], [7200, 560], [7600, 500]],
      idleRpm: 1100,
      redlineRpm: 7400,
      limiterRpm: 7500,
      inertia: 0.18,
      engineBrakeNm: 90,
      crank: 'crossplane',
      valvetrain: 'pushrod',
    },
    gearRatios: [2.86, 2.07, 1.62, 1.31, 1.1, 0.96],
    reverseRatio: 2.9,
    finalDrive: 3.36,
    shiftTimeS: 0.06,
    drivetrainEfficiency: 0.9,
    cdA: 0.82,
    clA: 1.9,
    aeroBalanceFront: 0.42,
    tyreMu: 1.55,
    maxBrakeTorqueNm: 4200,
    brakeBiasFront: 0.6,
    maxSteerRad: 0.36,
  },
  mustang: {
    kind: 'mustang',
    displayName: 'Ford Mustang GT (Gen3 Supercar)',
    shortName: 'Mustang GT',
    dimensions: { ...GEN3_DIMENSIONS },
    massKg: 1395,
    frontWeight: 0.52,
    cgHeight: 0.42,
    yawInertia: 2050,
    engine: {
      label: '5.4 L DOHC V8',
      displacementL: 5.4,
      torqueCurve: [[1000, 380], [2500, 480], [4000, 570], [5000, 615], [6000, 640], [6800, 625], [7400, 575], [7800, 520]],
      idleRpm: 1200,
      redlineRpm: 7600,
      limiterRpm: 7700,
      inertia: 0.16,
      engineBrakeNm: 95,
      crank: 'crossplane',
      valvetrain: 'dohc',
    },
    gearRatios: [2.86, 2.07, 1.62, 1.31, 1.1, 0.96],
    reverseRatio: 2.9,
    finalDrive: 3.3,
    shiftTimeS: 0.06,
    drivetrainEfficiency: 0.9,
    cdA: 0.82,
    clA: 1.9,
    aeroBalanceFront: 0.42,
    tyreMu: 1.55,
    maxBrakeTorqueNm: 4200,
    brakeBiasFront: 0.6,
    maxSteerRad: 0.36,
  },
};
