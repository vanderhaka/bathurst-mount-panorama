import type { CarKind } from '@/car/car-specs';

export type Surface = 'asphalt' | 'kerb' | 'grass' | 'gravel';

/** Per-frame inputs for the car sound. */
export interface CarAudioFrame {
  rpm: number;
  /** Engine load 0..1 (throttle opening under load; low on overrun). */
  load: number;
  throttle: number; // 0..1
  speedKmh: number;
  gear: number;
  onLimiter: boolean;
  /** Tyre slip 0..1 (0 = grip, 1 = full slide) for squeal. */
  slip: number;
  /** Loaded tyre demand 0..1 for rubber scrub before a full slide (omitted = silent). */
  scrub?: number;
  surface: Surface;
  /** 0..1 = how much the camera is inside the car (cockpit = 1, chase = 0). Changes the mix. */
  interior: number;
  /** True for one frame when a gear change happens (for the shift "crack"). */
  shifted: boolean;
}

export interface CarAudio {
  /** Must be called from a user gesture (click/keypress/gamepad button). */
  start(): Promise<void>;
  update(frame: CarAudioFrame, dt: number): void;
  /** Collision thump/crunch. energy 0..1. */
  impact(energy: number): void;
  setMasterVolume(v: number): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}

export type CreateCarAudio = (kind: CarKind, context?: AudioContext) => CarAudio;
