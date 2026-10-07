// Pure logic for dash indicators: shift lights, sector colours, damage colour mix.
import type { SectorState } from '@/types/hud';

export const SHIFT_LED_COUNT = 15;

export type LedColour = 'green' | 'amber' | 'red';
export type ShiftPhase = 'off' | 'build' | 'shift' | 'limiter';

/** Colour of LED i: first third green, middle third amber, last third red. */
export function ledColourAt(index: number, count = SHIFT_LED_COUNT): LedColour {
  const third = count / 3;
  if (index < third) return 'green';
  if (index < third * 2) return 'amber';
  return 'red';
}

/**
 * Number of lit LEDs: 0 below startRpm, 1 at startRpm, rising linearly so the
 * last LED lights exactly at shiftRpm (when the strip flashes blue).
 */
export function shiftLightCount(rpm: number, startRpm: number, shiftRpm: number, count = SHIFT_LED_COUNT): number {
  if (!(rpm >= startRpm)) return 0;
  if (rpm >= shiftRpm || shiftRpm <= startRpm) return count;
  const t = (rpm - startRpm) / (shiftRpm - startRpm);
  return Math.min(count - 1, 1 + Math.floor(t * (count - 1)));
}

export function shiftPhase(rpm: number, startRpm: number, shiftRpm: number, onLimiter: boolean): ShiftPhase {
  if (onLimiter) return 'limiter';
  if (rpm >= shiftRpm) return 'shift';
  if (rpm >= startRpm) return 'build';
  return 'off';
}

/** CSS modifier for a sector state (F1/broadcast convention). */
export function sectorClass(state: SectorState): 'none' | 'pb' | 'ob' | 'slow' {
  switch (state) {
    case 'overallBest':
      return 'ob';
    case 'personalBest':
      return 'pb';
    case 'slower':
      return 'slow';
    default:
      return 'none';
  }
}

/** Theme variable holding the colour of a sector state. */
export function sectorColourVar(state: SectorState): string {
  switch (state) {
    case 'overallBest':
      return '--hud-sector-overall';
    case 'personalBest':
      return '--hud-sector-personal';
    case 'slower':
      return '--hud-sector-slower';
    default:
      return '--hud-sector-none';
  }
}

/**
 * Damage 0..1 -> two mix weights for CSS color-mix: ok->mid over 0..0.5 (d1)
 * then mid->bad over 0.5..1 (d2). Quantised to 5 % steps to limit DOM writes.
 */
export function damageMix(level: number): { d1: number; d2: number; q: number } {
  const q = Math.round(Math.max(0, Math.min(1, level)) * 20) / 20;
  return { d1: Math.min(1, q * 2), d2: Math.max(0, q * 2 - 1), q };
}

/** Peak power (kW) of a torque curve, sampled every 50 rpm with linear interpolation. */
export function peakPowerKw(curve: ReadonlyArray<readonly [number, number]>): { kw: number; rpm: number } {
  let best = { kw: 0, rpm: 0 };
  for (let i = 0; i < curve.length - 1; i++) {
    const [r0, t0] = curve[i];
    const [r1, t1] = curve[i + 1];
    for (let r = r0; r <= r1; r += 50) {
      const torque = t0 + ((t1 - t0) * (r - r0)) / (r1 - r0);
      const kw = (torque * r * 2 * Math.PI) / 60 / 1000;
      if (kw > best.kw) best = { kw, rpm: r };
    }
  }
  return best;
}
