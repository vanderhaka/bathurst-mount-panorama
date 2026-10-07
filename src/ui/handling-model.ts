// Settings "Handling" tab model: each handling value with its menu step, text and
// help. Pure (no DOM) so it can be unit-tested.
import { DEFAULT_HANDLING, HANDLING_RANGES, type HandlingConfig } from '@/config/handling';

export interface HandlingField {
  key: keyof HandlingConfig;
  label: string;
  help: string;
  /** Change per left / right press. */
  step: number;
  unit: string;
  digits: number;
}

export const HANDLING_FIELDS: HandlingField[] = [
  { key: 'grip', label: 'Tyre grip', step: 0.02, unit: '×', digits: 2, help: 'Grip of all four tyres. 1.00 = the measured car.' },
  { key: 'slideGrip', label: 'Grip in a slide', step: 0.02, unit: '', digits: 2, help: 'Grip that stays when the car slides. Higher = slides are easier to catch. 0.59 = the measured car.' },
  { key: 'rearGrip', label: 'Rear grip', step: 0.02, unit: '×', digits: 2, help: 'Above 1.00 = a more stable rear. Below 1.00 = a looser rear.' },
  { key: 'peakSlipDeg', label: 'Peak slip angle', step: 0.2, unit: '°', digits: 1, help: 'Higher = the grip limit comes on more gently. 6.3° = the measured car.' },
  { key: 'downforce', label: 'Downforce', step: 0.05, unit: '×', digits: 2, help: 'Grip at high speed. 1.00 = the measured car.' },
  { key: 'steerSpeedDeg', label: 'Steering speed', step: 5, unit: '°/s', digits: 0, help: 'How fast the front wheels turn to the steering input. 149°/s = the measured car.' },
];

/** The field's value one step in `dir`, clamped to its range (no float drift). */
export function stepHandling(h: Readonly<HandlingConfig>, field: HandlingField, dir: -1 | 1): number {
  const [min, max] = HANDLING_RANGES[field.key];
  const v = Math.round((h[field.key] + dir * field.step) * 1000) / 1000;
  return Math.min(max, Math.max(min, v));
}

export function handlingText(field: HandlingField, v: number): string {
  return `${v.toFixed(field.digits)}${field.unit}`;
}

/** Position of the value in its range (0..1), for the meter under the value. */
export function handlingFraction(field: HandlingField, v: number): number {
  const [min, max] = HANDLING_RANGES[field.key];
  return (v - min) / (max - min);
}

export function isDefaultHandling(field: HandlingField, v: number): boolean {
  return Math.abs(v - DEFAULT_HANDLING[field.key]) < 1e-6;
}
