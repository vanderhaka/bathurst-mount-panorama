// Tunable handling: multipliers on the measured car data in car-specs.ts, edited
// live in Settings > Handling (dev builds only). The defaults are the user's tuned
// feel; MEASURED_HANDLING reproduces the measured car. The physics reads the values
// every frame; the racing-line speeds follow at the next race start.
import type { CarSpec } from '@/car/car-specs';
import { DEV_TOOLS } from '@/config/build-flags';

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

/** The measured car (car-specs.ts and the warm-slick tyre curve) with no changes. */
export const MEASURED_HANDLING: Readonly<HandlingConfig> = {
  grip: 1,
  rearGrip: 1,
  slideGrip: 0.59,
  peakSlipDeg: 6.3,
  downforce: 1,
  steerSpeedDeg: 149,
};

/** The game's handling: tuned by the user on 2026-10-07 (more grip, a softer and more forgiving limit). */
export const DEFAULT_HANDLING: Readonly<HandlingConfig> = {
  grip: 1.2,
  rearGrip: 1.1,
  slideGrip: 0.89,
  peakSlipDeg: 9.1,
  downforce: 1.1,
  steerSpeedDeg: 149,
};

/** Allowed range of each value: [min, max]. */
export const HANDLING_RANGES: Record<keyof HandlingConfig, [number, number]> = {
  grip: [0.7, 1.4],
  rearGrip: [0.8, 1.25],
  slideGrip: [0.4, 0.95],
  peakSlipDeg: [3.5, 12],
  downforce: [0.5, 1.6],
  steerSpeedDeg: [60, 300],
};

const STORAGE_KEY = 'bathurst.handling.v1';
const KEYS = Object.keys(DEFAULT_HANDLING) as (keyof HandlingConfig)[];

/** Keeps only known keys with finite numbers, clamped to the allowed ranges. */
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

// Saved changes apply only where the Handling tab exists (dev builds).
let current: HandlingConfig = { ...DEFAULT_HANDLING, ...(DEV_TOOLS ? loadSaved() : {}) };

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

/**
 * A car spec with the handling multipliers applied (for the racing-line speed profile). tyreMu is the
 * mean of the two axles; limitingGrip is the weaker axle relative to it (the front when rearGrip > 1).
 */
export function tunedSpec(spec: CarSpec, h: Readonly<HandlingConfig> = current): CarSpec {
  const limitingGrip = (2 * Math.min(1, h.rearGrip)) / (1 + h.rearGrip);
  return { ...spec, tyreMu: spec.tyreMu * h.grip * (1 + h.rearGrip) / 2, limitingGrip, clA: spec.clA * h.downforce };
}
