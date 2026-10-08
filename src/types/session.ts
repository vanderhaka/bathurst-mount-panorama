import type { CarKind } from '@/car/car-specs';
import { DEFAULT_HEAD_MOTION } from '@/camera/head-motion';
import type { QualityPreset } from '@/render/renderer';
import type { TouchSteeringMode } from '@/input/touch-model';
import type { TyreCompound } from '@/physics/tyre-state';

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
  phoneVibration: boolean;
  touchMode: TouchSteeringMode;
  touchAnalogThrottle: boolean;
  touchAutoThrottle: boolean;
  touchLeftHanded: boolean;
  /** The touch player has been asked how to steer (or already changed the mode): ask only once. Not an option row. */
  steerOnboarded: boolean;
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
  hudSize: 'full' | 'minimal';
  motionBlur: boolean;
  /** Cockpit g-force movement and shake amount (0 = off, 1 = full). */
  headMotion: number;
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
  phoneVibration: true,
  touchMode: 'drag',
  touchAnalogThrottle: false,
  touchAutoThrottle: false,
  touchLeftHanded: false,
  steerOnboarded: false,
  damage: 'full',
  ghost: true,
  units: 'kmh',
  quality: 'high',
  autoQuality: false,
  frameRate: 0,
  camera: 'chase',
  masterVolume: 0.8,
  showFps: false,
  hudSize: 'full',
  motionBlur: true,
  headMotion: DEFAULT_HEAD_MOTION,
};

export interface SessionConfig {
  car: CarKind;
  /** Livery preset index (0..n-1) offered on the car-select screen. */
  liveryIndex: number;
  /** Fitted at session start; Restart keeps this choice and fits a fresh set. */
  tyres?: TyreCompound;
  settings: Settings;
}

/** A completed lap, for the results table. */
export interface LapRecord {
  car: CarKind;
  timeS: number;
  sectorsS: number[];
  valid: boolean;
  dateIso: string;
  /** The standing-start lap, timed from lights out: never valid by design (absent in older saves). */
  standing?: boolean;
}
