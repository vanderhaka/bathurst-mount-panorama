import type { SetupKey } from '@/config/setup';

export interface SetupField { key: SetupKey; label: string; help: string }

export const SETUP_FIELDS: SetupField[] = [
  { key: 'brakeBiasFront', label: 'Brake bias', help: 'The share of braking sent to the front axle. [ / ] or left / right stick clicks change it by 0.5% while driving.' },
  { key: 'frontArbNpm', label: 'Front anti-roll bar', help: 'A stiffer front bar transfers more cornering load across the front axle. Lower values let the body roll more.' },
  { key: 'rearArbNpm', label: 'Rear anti-roll bar', help: 'A stiffer rear bar transfers more cornering load across the rear axle. Lower values let the body roll more.' },
  { key: 'frontPressureKpa', label: 'Front tyre pressure', help: 'Changes front grip and braking. 150 kPa is the default working pressure; grip decreases toward either end of the safe range.' },
  { key: 'rearPressureKpa', label: 'Rear tyre pressure', help: 'Changes rear grip and braking. 150 kPa is the default working pressure; grip decreases toward either end of the safe range.' },
];

export function setupText(key: SetupKey, value: number): string {
  if (key === 'brakeBiasFront') return `${(value * 100).toFixed(1)}% front`;
  if (key === 'frontArbNpm' || key === 'rearArbNpm') return `${value / 1000} kN/m`;
  return `${value.toFixed(0)} kPa · ${(value / 6.894757).toFixed(1)} psi`;
}
