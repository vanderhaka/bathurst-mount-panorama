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
  /** Steering sensitivity per input device (1 = the default feel; 0.5 to 2). */
  steerKeyboard: number;
  steerPad: number;
  steerTouch: number;
  /** Full = crashes change the car's mechanics; visual = dents only; off = no damage. */
  damage: 'full' | 'visual' | 'off';
  ghost: boolean;
  units: 'kmh' | 'mph';
  quality: QualityPreset;
  /** Learn graphics quality during a race; selecting a tier explicitly turns this off. */
  autoQuality: boolean;
  /** Most frames per second; 0 = no limit (the display's refresh rate). */
  frameRate: 0 | 30 | 60 | 120;
  camera: CameraMode;
  masterVolume: number; // 0..1
  showFps: boolean;
  motionBlur: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  racingLine: 'braking',
  autoGears: true,
  tractionControl: true,
  abs: true,
  steeringAssist: true,
  steerKeyboard: 1,
  steerPad: 1,
  steerTouch: 1,
  damage: 'full',
  ghost: true,
  units: 'kmh',
  quality: 'high',
  autoQuality: true,
  frameRate: 0,
  camera: 'chase',
  masterVolume: 0.8,
  showFps: false,
  motionBlur: true,
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
