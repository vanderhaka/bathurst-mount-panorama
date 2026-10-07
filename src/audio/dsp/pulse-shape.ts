import type { FiringSlot } from '@/audio/dsp/firing';
import { SLOTS } from '@/audio/dsp/firing';

/** Longest pulse the synth tracks, in slots (1 slot = 90 degrees of crank). */
export const PULSE_MAX_SLOTS = 3;
export const PULSE_TABLE_SIZE = 768;
export const PULSE_TABLE_SCALE = PULSE_TABLE_SIZE / PULSE_MAX_SLOTS;

/**
 * Exhaust blow-down pulse as a function of crank angle (in slots): a fast
 * attack as the exhaust valve cracks open followed by a slower decay. Defined in
 * crank-angle units, so the pulse automatically narrows (and brightens) as rpm
 * rises. Peak-normalised, with a smooth taper to zero at the end of the table.
 */
export function buildPulseTable(attackSlots: number, decaySlots: number): Float32Array {
  const table = new Float32Array(PULSE_TABLE_SIZE + 2);
  let peak = 0;
  for (let i = 0; i <= PULSE_TABLE_SIZE; i++) {
    const u = i / PULSE_TABLE_SCALE;
    const taper = u > 2.4 ? 0.5 + 0.5 * Math.cos((Math.PI * (u - 2.4)) / (PULSE_MAX_SLOTS - 2.4)) : 1;
    const v = (Math.exp(-u / decaySlots) - Math.exp(-u / attackSlots)) * taper;
    table[i] = v;
    if (v > peak) peak = v;
  }
  for (let i = 0; i <= PULSE_TABLE_SIZE; i++) table[i] /= peak;
  table[PULSE_TABLE_SIZE + 1] = 0;
  return table;
}

export interface PatternSpec {
  slots: readonly FiringSlot[];
  cylinderGain: readonly number[];
  /** Amplitude multiplier indexed by gap in slots (index 0 unused). */
  gapGain: readonly number[];
  pulse: Float32Array;
}

export function slotAmplitude(spec: PatternSpec, slot: FiringSlot): number {
  const gap = Math.min(slot.gapSlots, spec.gapGain.length - 1);
  return spec.cylinderGain[slot.cylinder - 1] * spec.gapGain[gap];
}

/** One 720 degree engine cycle of the dry pulse pattern (all banks summed). */
export function renderPatternCycle(spec: PatternSpec, samples = 4096): Float32Array {
  const out = new Float32Array(samples);
  const slotLen = samples / SLOTS;
  for (let s = 0; s < SLOTS; s++) {
    const amp = slotAmplitude(spec, spec.slots[s]);
    for (let n = 0; n < samples; n++) {
      const u = n / slotLen; // slots after the cycle origin
      const rel = u - s;
      const wrapped = rel < 0 ? rel + SLOTS : rel;
      if (wrapped >= PULSE_MAX_SLOTS) continue;
      const pos = wrapped * PULSE_TABLE_SCALE;
      const i0 = Math.floor(pos);
      const frac = pos - i0;
      out[n] += amp * (spec.pulse[i0] + (spec.pulse[i0 + 1] - spec.pulse[i0]) * frac);
    }
  }
  return out;
}

export interface HarmonicSeries {
  /** Index = harmonic of the cycle frequency (rpm / 120); index 0 is DC (zeroed). */
  real: Float32Array;
  imag: Float32Array;
}

/** Fourier series of one cycle, ready for `AudioContext.createPeriodicWave`. */
export function patternHarmonics(cycle: Float32Array, maxHarmonic: number): HarmonicSeries {
  const n = cycle.length;
  const real = new Float32Array(maxHarmonic + 1);
  const imag = new Float32Array(maxHarmonic + 1);
  for (let h = 1; h <= maxHarmonic; h++) {
    let re = 0;
    let im = 0;
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * h * i) / n;
      re += cycle[i] * Math.cos(a);
      im += cycle[i] * Math.sin(a);
    }
    real[h] = (2 * re) / n;
    imag[h] = (2 * im) / n;
  }
  return { real, imag };
}

/** Amplitude of each engine order (cycle harmonic h = order * 2); key = order. */
export function orderAmplitudes(series: HarmonicSeries): Map<number, number> {
  const out = new Map<number, number>();
  for (let h = 1; h < series.real.length; h++) {
    out.set(h / 2, Math.hypot(series.real[h], series.imag[h]));
  }
  return out;
}
