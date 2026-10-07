import type { CarKind } from '@/car/car-specs';
import type { QualityPreset } from '@/render/renderer';

export type CameraMode = 'chase' | 'chaseFar' | 'bonnet' | 'cockpit' | 'tv';

/** Player settings. Persisted in localStorage (best effort). */
export interface Settings {
  racingLine: 'off' | 'braking' | 'full';
  autoGears: boolean;
  tractionControl: boolean;
  abs: boolean;
  steeringAssist: boolean;
  ghost: boolean;
  units: 'kmh' | 'mph';
  quality: QualityPreset;
  camera: CameraMode;
  masterVolume: number; // 0..1
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  racingLine: 'braking',
  autoGears: true,
  tractionControl: true,
  abs: true,
  steeringAssist: true,
  ghost: true,
  units: 'kmh',
  quality: 'high',
  camera: 'chase',
  masterVolume: 0.8,
  showFps: false,
};

export interface SessionConfig {
  car: CarKind;
  /** Livery preset index (0..n-1) offered on the car-select screen. */
  liveryIndex: number;
  settings: Settings;
}

/** A completed lap, for the results table. */
export interface LapRecord {
  car: CarKind;
  timeS: number;
  sectorsS: number[];
  valid: boolean;
  dateIso: string;
}
