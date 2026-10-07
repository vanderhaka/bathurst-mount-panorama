import { clamp, clamp01, lerp, lerpLog, smoothstep } from '@/audio/dsp/math';
import type { Surface } from '@/types/audio';

/** Wind noise level: rises with speed squared, ~1.0 at 300 km/h. */
export function windGain(speedKmh: number): number {
  const v = clamp(speedKmh / 300, 0, 1.3);
  return v * v;
}

export function windCutoffHz(speedKmh: number): number {
  return 450 + 2800 * clamp(speedKmh / 300, 0, 1.3);
}

/** Tyre squeal level: zero until a real slide, louder at higher speed. */
export function squealGain(slip: number, speedKmh: number): number {
  const s = smoothstep(0.12, 0.85, slip);
  return s * s * (0.25 + 0.75 * clamp(speedKmh / 180, 0, 1));
}

/** Squeal pitch factor: the scream rises a little with speed and with slide angle. */
export function squealPitch(slip: number, speedKmh: number): number {
  return 0.88 + 0.16 * clamp01(speedKmh / 250) + 0.12 * clamp01(slip);
}

/** Kerb rumble rate in Hz: wheel passes serrations roughly 0.4 m apart. */
export function kerbRumbleHz(speedKmh: number): number {
  return clamp(speedKmh / 3.6 / 0.4, 6, 110);
}

export function surfaceSpeedGain(speedKmh: number): number {
  return clamp(speedKmh / 120, 0, 1.2);
}

export function roadRoarGain(speedKmh: number): number {
  return Math.pow(clamp(speedKmh / 200, 0, 1.3), 1.3);
}

export interface SurfaceWeights {
  kerb: number;
  gravel: number;
  grass: number;
}

export function surfaceWeights(surface: Surface): SurfaceWeights {
  return {
    kerb: surface === 'kerb' ? 1 : 0,
    gravel: surface === 'gravel' ? 1 : 0,
    grass: surface === 'grass' ? 1 : 0,
  };
}

/** Cabin low-pass for the exhaust: wide open outside, muffled inside. */
export function cabinLowpassHz(interior: number): number {
  return lerpLog(16000, 2200, clamp01(interior));
}

export interface LayerMix {
  exhaust: number;
  intake: number;
  mechanical: number;
  tyre: number;
  surface: number;
  wind: number;
  impact: number;
}

/** Bus gains by camera position: exhaust dominates outside, induction + gearbox inside. */
export function layerMix(interior: number): LayerMix {
  const i = clamp01(interior);
  return {
    exhaust: lerp(1.0, 0.42, i),
    intake: lerp(0.35, 1.0, i),
    mechanical: lerp(0.3, 1.0, i),
    tyre: lerp(0.9, 1.0, i),
    surface: lerp(0.9, 1.0, i),
    wind: lerp(0.55, 0.85, i),
    impact: lerp(1.0, 1.0, i),
  };
}

export interface WhineFrequencies {
  /** Constant-mesh gear pair, tracks engine speed. */
  inputHz: number;
  /** Final-drive pinion, tracks road speed. */
  pinionHz: number;
}

/** Straight-cut gearbox whine tones (mesh frequency = shaft rev rate x teeth). */
export function gearWhineHz(
  rpm: number,
  speedKmh: number,
  wheelRadiusM: number,
  finalDrive: number,
  inputTeeth: number,
  pinionTeeth: number,
): WhineFrequencies {
  const wheelRevS = speedKmh / 3.6 / (2 * Math.PI * wheelRadiusM);
  return {
    inputHz: (rpm / 60) * inputTeeth,
    pinionHz: wheelRevS * finalDrive * pinionTeeth,
  };
}

/** Whine is strongest on drive, a little less on coast, and gone out of gear. */
export function whineGain(gear: number, load: number): number {
  if (gear <= 0) return 0;
  return 0.5 + 0.5 * clamp01(load);
}
