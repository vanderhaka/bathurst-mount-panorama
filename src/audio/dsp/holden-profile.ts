import { CAR_SPECS } from '@/car/car-specs';
import type { FiringLayout } from '@/audio/dsp/firing';
import type { CarSoundProfile } from '@/audio/dsp/engine-profile';

/**
 * 1979 Holden 308 (5.0 L pushrod V8) on twin downdraught carburettors. It starts from the
 * Camaro's cross-plane pushrod character and goes rawer and more mechanical: a big-cam idle
 * lope (more timing and amplitude scatter), more rasp, a deeper and less refined collector,
 * a strong open-trumpet intake roar and a straight-cut gearbox whine. The resolved firing
 * layout is passed in (engine-profile.ts keeps flatPlaneAware private).
 */
export function holdenProfile(layout: FiringLayout): CarSoundProfile {
  const e = CAR_SPECS.torana.engine;
  return {
    kind: 'torana',
    idleRpm: e.idleRpm,
    limiterRpm: e.limiterRpm,
    layout,
    cylinderGain: [1.0, 0.9, 1.08, 0.95, 1.05, 0.9, 1.06, 0.94],
    gapGain: [0, 1.55, 1.0, 0.66],
    pulseAttackSlots: 0.13,
    pulseDecaySlots: 0.5,
    timingJitter: 0.11,
    ampJitter: 0.16,
    bankGain: [1.0, 0.88],
    primaryMs: [3.5, 3.8],
    primaryFeedback: -0.55,
    primaryDampHz: 2400,
    bankDrive: 1.45,
    collectorMs: 11.6,
    collectorFeedback: 0.34,
    collectorDampHz: 1500,
    formants: [
      { hz: 70, q: 3.0, gain: 0.95 },
      { hz: 135, q: 3.5, gain: 0.72 },
      { hz: 270, q: 3.0, gain: 0.52 },
      { hz: 520, q: 2.5, gain: 0.38 },
      { hz: 1000, q: 2.0, gain: 0.24 },
    ],
    formantDry: 0.55,
    brightHz: { overrun: 1400, full: 3800 },
    drive: { overrun: 0.8, full: 2.5 },
    rasp: { gain: 0.7, hz: 1600, q: 0.9, decaySlots: 0.3 },
    exhaustLevel: 0.52,
    intake: {
      noiseHzLow: 260,
      noiseHzHigh: 1400,
      noiseQ: 1.2,
      noiseGain: 0.72,
      modDepth: 0.6,
      honkHz: 150,
      honkQ: 4.5,
      honkGain: 0.65,
      level: 1.55,
    },
    mechanical: {
      inputTeeth: 19,
      pinionTeeth: 11,
      whineGain: 0.07,
      valvetrainHz: 2200,
      valvetrainOrder: 2,
      valvetrainGain: 0.016,
    },
    popPitch: [0.65, 0.95],
    seed: 0x308a9c,
  };
}
