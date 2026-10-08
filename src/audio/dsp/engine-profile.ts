import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import {
  CHEVY_LAYOUT,
  FLAT_PLANE_LAYOUT,
  FORD_LAYOUT,
  HOLDEN_LAYOUT,
  TOYOTA_LAYOUT,
  type FiringLayout,
} from '@/audio/dsp/firing';
import { holdenProfile } from '@/audio/dsp/holden-profile';

export interface FormantSpec {
  hz: number;
  q: number;
  gain: number;
}

export interface IntakeSpec {
  /** Broadband induction roar centre, swept from low to high with rpm. */
  noiseHzLow: number;
  noiseHzHigh: number;
  noiseQ: number;
  noiseGain: number;
  /** Depth of the amplitude modulation at the firing frequency (0..1). */
  modDepth: number;
  /** Plenum "honk": a resonance rung by each intake pulse. */
  honkHz: number;
  honkQ: number;
  honkGain: number;
  level: number;
}

export interface MechanicalSpec {
  /** Constant-mesh gear pair tooth count (whine at engine rev rate x teeth). */
  inputTeeth: number;
  /** Final-drive pinion tooth count (whine at driveshaft rev rate x teeth). */
  pinionTeeth: number;
  whineGain: number;
  /** Valvetrain character: pushrod = low clatter, DOHC = higher chain/cam whirr. */
  valvetrainHz: number;
  valvetrainOrder: number;
  valvetrainGain: number;
}

/** Everything that makes one engine sound like itself. Pure data, structured-cloneable. */
export interface CarSoundProfile {
  kind: CarKind;
  idleRpm: number;
  limiterRpm: number;
  layout: FiringLayout;
  /** Static per-cylinder strength, index = cylinder number - 1. */
  cylinderGain: readonly number[];
  /** Pulse strength by same-bank gap in slots (index 0 unused). */
  gapGain: readonly number[];
  pulseAttackSlots: number;
  pulseDecaySlots: number;
  /** Cycle-to-cycle firing time scatter, in slots. */
  timingJitter: number;
  /** Cycle-to-cycle amplitude scatter (fraction), larger at low rpm. */
  ampJitter: number;
  bankGain: readonly [number, number];
  primaryMs: readonly [number, number];
  primaryFeedback: number;
  primaryDampHz: number;
  /** Per-bank saturation drive before the banks are merged. */
  bankDrive: number;
  collectorMs: number;
  collectorFeedback: number;
  collectorDampHz: number;
  formants: readonly FormantSpec[];
  formantDry: number;
  /** Exhaust low-pass cutoff: hollow on overrun, bright on throttle. */
  brightHz: { overrun: number; full: number };
  drive: { overrun: number; full: number };
  rasp: { gain: number; hz: number; q: number; decaySlots: number };
  exhaustLevel: number;
  intake: IntakeSpec;
  mechanical: MechanicalSpec;
  /** Playback-rate range for overrun pops (low = deep, high = crisp). */
  popPitch: readonly [number, number];
  seed: number;
}

function flatPlaneAware(kind: CarKind, layout: FiringLayout): FiringLayout {
  return CAR_SPECS[kind].engine.crank === 'flatplane' ? FLAT_PLANE_LAYOUT : layout;
}

function camaroProfile(): CarSoundProfile {
  const e = CAR_SPECS.camaro.engine;
  return {
    kind: 'camaro',
    idleRpm: e.idleRpm,
    limiterRpm: e.limiterRpm,
    layout: flatPlaneAware('camaro', CHEVY_LAYOUT),
    cylinderGain: [1.0, 0.93, 1.06, 0.97, 1.03, 0.92, 1.05, 0.96],
    gapGain: [0, 1.5, 1.0, 0.68],
    pulseAttackSlots: 0.12,
    pulseDecaySlots: 0.45,
    timingJitter: 0.07,
    ampJitter: 0.11,
    bankGain: [1.0, 0.9],
    primaryMs: [3.3, 3.58],
    primaryFeedback: -0.55,
    primaryDampHz: 2600,
    bankDrive: 1.3,
    collectorMs: 10.4,
    collectorFeedback: 0.3,
    collectorDampHz: 1800,
    formants: [
      { hz: 78, q: 3.0, gain: 0.9 },
      { hz: 145, q: 3.5, gain: 0.7 },
      { hz: 290, q: 3.0, gain: 0.5 },
      { hz: 560, q: 2.5, gain: 0.35 },
      { hz: 1100, q: 2.0, gain: 0.2 },
    ],
    formantDry: 0.55,
    brightHz: { overrun: 1500, full: 4200 },
    drive: { overrun: 0.7, full: 2.2 },
    rasp: { gain: 0.55, hz: 1800, q: 0.9, decaySlots: 0.25 },
    exhaustLevel: 0.5,
    intake: {
      noiseHzLow: 300,
      noiseHzHigh: 1500,
      noiseQ: 1.3,
      noiseGain: 0.5,
      modDepth: 0.55,
      honkHz: 165,
      honkQ: 5,
      honkGain: 0.6,
      level: 1.3,
    },
    mechanical: {
      inputTeeth: 19,
      pinionTeeth: 11,
      whineGain: 0.05,
      valvetrainHz: 2400,
      valvetrainOrder: 2,
      valvetrainGain: 0.012,
    },
    popPitch: [0.7, 1.0],
    seed: 0xca3a60,
  };
}

function mustangProfile(): CarSoundProfile {
  const e = CAR_SPECS.mustang.engine;
  return {
    kind: 'mustang',
    idleRpm: e.idleRpm,
    limiterRpm: e.limiterRpm,
    layout: flatPlaneAware('mustang', FORD_LAYOUT),
    cylinderGain: [1.0, 0.95, 1.04, 0.97, 1.03, 0.94, 1.05, 0.98],
    gapGain: [0, 1.32, 1.0, 0.8],
    pulseAttackSlots: 0.06,
    pulseDecaySlots: 0.28,
    timingJitter: 0.045,
    ampJitter: 0.07,
    bankGain: [1.0, 0.94],
    primaryMs: [2.5, 2.62],
    primaryFeedback: -0.5,
    primaryDampHz: 3600,
    bankDrive: 1.1,
    collectorMs: 7.3,
    collectorFeedback: 0.28,
    collectorDampHz: 2600,
    formants: [
      { hz: 115, q: 3.5, gain: 0.8 },
      { hz: 210, q: 4.0, gain: 0.7 },
      { hz: 410, q: 3.5, gain: 0.55 },
      { hz: 820, q: 3.0, gain: 0.4 },
      { hz: 1650, q: 2.5, gain: 0.3 },
    ],
    formantDry: 0.5,
    brightHz: { overrun: 2000, full: 6200 },
    drive: { overrun: 0.6, full: 1.7 },
    rasp: { gain: 0.5, hz: 2600, q: 0.8, decaySlots: 0.2 },
    exhaustLevel: 0.5,
    intake: {
      noiseHzLow: 450,
      noiseHzHigh: 2600,
      noiseQ: 1.2,
      noiseGain: 0.5,
      modDepth: 0.45,
      honkHz: 240,
      honkQ: 5,
      honkGain: 0.55,
      level: 1.25,
    },
    mechanical: {
      inputTeeth: 19,
      pinionTeeth: 11,
      whineGain: 0.05,
      valvetrainHz: 6200,
      valvetrainOrder: 8,
      valvetrainGain: 0.02,
    },
    popPitch: [0.95, 1.3],
    seed: 0xf0d5a2,
  };
}

/**
 * Toyota 5.2 L quad-cam V8 (2UR-GSE based): DOHC like the Ford, but less displacement
 * and its own firing order. Shorter primaries, higher formants and a smoother pulse put
 * it between the Chevrolet's deep note and the Ford's bright one (tests/audio.test.ts),
 * with more intake howl and cam whirr than either.
 */
function supraProfile(): CarSoundProfile {
  const e = CAR_SPECS.supra.engine;
  return {
    kind: 'supra',
    idleRpm: e.idleRpm,
    limiterRpm: e.limiterRpm,
    layout: flatPlaneAware('supra', TOYOTA_LAYOUT),
    cylinderGain: [1.0, 0.96, 1.03, 0.98, 1.02, 0.95, 1.04, 0.97],
    gapGain: [0, 1.4, 1.0, 0.74],
    pulseAttackSlots: 0.06,
    pulseDecaySlots: 0.3,
    timingJitter: 0.04,
    ampJitter: 0.06,
    bankGain: [1.0, 0.95],
    primaryMs: [2.3, 2.42],
    primaryFeedback: -0.48,
    primaryDampHz: 3900,
    bankDrive: 1.05,
    collectorMs: 6.6,
    collectorFeedback: 0.26,
    collectorDampHz: 2900,
    formants: [
      { hz: 125, q: 3.5, gain: 0.75 },
      { hz: 230, q: 4.0, gain: 0.7 },
      { hz: 450, q: 3.5, gain: 0.58 },
      { hz: 900, q: 3.0, gain: 0.45 },
      { hz: 1800, q: 2.5, gain: 0.32 },
    ],
    formantDry: 0.5,
    brightHz: { overrun: 2200, full: 6800 },
    drive: { overrun: 0.55, full: 1.6 },
    rasp: { gain: 0.42, hz: 2900, q: 0.8, decaySlots: 0.18 },
    exhaustLevel: 0.48,
    intake: {
      noiseHzLow: 500,
      noiseHzHigh: 2900,
      noiseQ: 1.2,
      noiseGain: 0.55,
      modDepth: 0.42,
      honkHz: 270,
      honkQ: 5,
      honkGain: 0.6,
      level: 1.35,
    },
    mechanical: {
      inputTeeth: 19,
      pinionTeeth: 11,
      whineGain: 0.05,
      valvetrainHz: 6800,
      valvetrainOrder: 8,
      valvetrainGain: 0.026,
    },
    popPitch: [1.0, 1.4],
    seed: 0x70a2e1,
  };
}

export const CAR_SOUND_PROFILES: Record<CarKind, CarSoundProfile> = {
  camaro: camaroProfile(),
  mustang: mustangProfile(),
  supra: supraProfile(),
  torana: holdenProfile(flatPlaneAware('torana', HOLDEN_LAYOUT)),
};
