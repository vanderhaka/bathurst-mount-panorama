// Tunable handling: multipliers on the measured car data in car-specs.ts, edited
// live in the tuner (F2, "Handling"). Defaults reproduce the measured car exactly.
// The physics reads the values every frame; the racing-line speeds follow at the
// next race start.
import type { CarSpec } from '@/car/car-specs';

export interface HandlingConfig {
  /** Multiplies the tyre friction coefficient of all four tyres. */
  grip: number;
  /** Rear-tyre grip relative to the front: above 1 = more stable rear, below 1 = looser rear. */
  rearGrip: number;
  /** Lateral grip left in a full slide, as a fraction of the peak. Higher = slides are easier to catch. */
  slideGrip: number;
  /** Slip angle (degrees) where the tyre gives its peak grip. Higher = a softer, more progressive limit. */
  peakSlipDeg: number;
  /** Multiplies the downforce. */
  downforce: number;
  /** Maximum speed of the front wheels' steering angle (degrees per second). */
  steerSpeedDeg: number;
}

export const DEFAULT_HANDLING: Readonly<HandlingConfig> = {
  grip: 1,
  rearGrip: 1,
  slideGrip: 0.59,
  peakSlipDeg: 6.3,
  downforce: 1,
  steerSpeedDeg: 149,
};

/** Slider ranges for the tuner: [min, max, step]. */
export const HANDLING_RANGES: Record<keyof HandlingConfig, [number, number, number]> = {
  grip: [0.7, 1.4, 0.01],
  rearGrip: [0.8, 1.25, 0.01],
  slideGrip: [0.4, 0.95, 0.01],
  peakSlipDeg: [3.5, 12, 0.1],
  downforce: [0.5, 1.6, 0.01],
  steerSpeedDeg: [60, 300, 1],
};

const STORAGE_KEY = 'bathurst.handling.v1';
const KEYS = Object.keys(DEFAULT_HANDLING) as (keyof HandlingConfig)[];

/** Keeps only known keys with finite numbers, clamped to the tuner ranges. */
export function sanitiseHandling(raw: unknown): Partial<HandlingConfig> {
  const clean: Partial<HandlingConfig> = {};
  if (!raw || typeof raw !== 'object') return clean;
  for (const k of KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    const [min, max] = HANDLING_RANGES[k];
    if (typeof v === 'number' && Number.isFinite(v)) clean[k] = Math.min(max, Math.max(min, v));
  }
  return clean;
}

function loadSaved(): Partial<HandlingConfig> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? sanitiseHandling(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

let current: HandlingConfig = { ...DEFAULT_HANDLING, ...loadSaved() };

export function getHandling(): Readonly<HandlingConfig> {
  return current;
}

export function setHandling(patch: Partial<HandlingConfig>): void {
  current = { ...current, ...sanitiseHandling(patch) };
}

export function saveHandling(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: the values stay for this session only */
  }
}

export function resetHandling(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  current = { ...DEFAULT_HANDLING };
}

/** JSON of the values that differ from the defaults (what to send back for tuning). */
export function exportHandling(): string {
  const diff: Partial<HandlingConfig> = {};
  for (const k of KEYS) if (current[k] !== DEFAULT_HANDLING[k]) diff[k] = current[k];
  return JSON.stringify(diff, null, 2);
}

export function importHandling(json: string): boolean {
  try {
    setHandling(sanitiseHandling(JSON.parse(json)));
    return true;
  } catch {
    return false;
  }
}

/** A car spec with the handling multipliers applied (for the racing-line speed profile). */
export function tunedSpec(spec: CarSpec, h: Readonly<HandlingConfig> = current): CarSpec {
  return { ...spec, tyreMu: spec.tyreMu * h.grip * (1 + h.rearGrip) / 2, clA: spec.clA * h.downforce };
}
