import { gainToDb } from '@/audio/dsp/math';

export interface Spectrum {
  sampleRate: number;
  /** Bin spacing in Hz. */
  binHz: number;
  /** Linear amplitude per bin (a full-scale sine reads 1.0). */
  mag: Float64Array;
}

export interface SpectrumPeak {
  hz: number;
  db: number;
}

/** In-place iterative radix-2 FFT. `re` and `im` must have equal power-of-two length. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Hann-windowed magnitude spectrum of `size` samples starting at `start`. */
export function magnitudeSpectrum(
  samples: ArrayLike<number>,
  sampleRate: number,
  start = 0,
  size = 65536,
): Spectrum {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  let wsum = 0;
  for (let i = 0; i < size; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
    re[i] = (samples[start + i] ?? 0) * w;
    wsum += w;
  }
  fft(re, im);
  const half = size / 2;
  const mag = new Float64Array(half);
  for (let k = 0; k < half; k++) mag[k] = (2 * Math.hypot(re[k], im[k])) / wsum;
  return { sampleRate, binHz: sampleRate / size, mag };
}

/** Local maxima in [fMin, fMax], strongest first, with parabolic frequency refinement. */
export function findPeaks(spec: Spectrum, fMin: number, fMax: number, count = 8): SpectrumPeak[] {
  const lo = Math.max(2, Math.floor(fMin / spec.binHz));
  const hi = Math.min(spec.mag.length - 2, Math.ceil(fMax / spec.binHz));
  const peaks: SpectrumPeak[] = [];
  for (let k = lo; k <= hi; k++) {
    const m = spec.mag[k];
    if (m > spec.mag[k - 1] && m >= spec.mag[k + 1]) {
      const a = Math.log(spec.mag[k - 1] + 1e-12);
      const b = Math.log(m + 1e-12);
      const c = Math.log(spec.mag[k + 1] + 1e-12);
      const denom = a - 2 * b + c;
      const offset = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
      peaks.push({ hz: (k + offset) * spec.binHz, db: gainToDb(m) });
    }
  }
  return peaks.sort((x, y) => y.db - x.db).slice(0, count);
}

/** Strongest spectral level within +-tolPct of `hz`, in dB (-Infinity-ish when silent). */
export function levelNear(spec: Spectrum, hz: number, tolPct = 3): number {
  const lo = Math.max(1, Math.floor((hz * (1 - tolPct / 100)) / spec.binHz));
  const hi = Math.min(spec.mag.length - 1, Math.ceil((hz * (1 + tolPct / 100)) / spec.binHz));
  let best = 0;
  for (let k = lo; k <= hi; k++) best = Math.max(best, spec.mag[k]);
  return gainToDb(best);
}

/** Power-weighted mean frequency in [fMin, fMax]. */
export function spectralCentroid(spec: Spectrum, fMin = 40, fMax = 8000): number {
  const lo = Math.floor(fMin / spec.binHz);
  const hi = Math.min(spec.mag.length - 1, Math.ceil(fMax / spec.binHz));
  let num = 0;
  let den = 0;
  for (let k = lo; k <= hi; k++) {
    const p = spec.mag[k] * spec.mag[k];
    num += p * k * spec.binHz;
    den += p;
  }
  return den > 0 ? num / den : 0;
}

export const THIRD_OCTAVE_CENTRES = [
  50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
];

/** Band levels (dB) in 1/3-octave bands, summing power inside each band. */
export function thirdOctaveDb(spec: Spectrum): number[] {
  const r = Math.pow(2, 1 / 6);
  return THIRD_OCTAVE_CENTRES.map((fc) => {
    const lo = Math.ceil(fc / r / spec.binHz);
    const hi = Math.min(spec.mag.length - 1, Math.floor((fc * r) / spec.binHz));
    let p = 0;
    for (let k = lo; k <= hi; k++) p += spec.mag[k] * spec.mag[k];
    return 10 * Math.log10(p + 1e-18);
  });
}

/** RMS difference in dB between two band-level arrays. */
export function bandDistanceDb(a: readonly number[], b: readonly number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(s / a.length);
}

export function rmsDb(samples: ArrayLike<number>, start = 0, end = samples.length): number {
  let s = 0;
  for (let i = start; i < end; i++) s += samples[i] * samples[i];
  return 10 * Math.log10(s / Math.max(1, end - start) + 1e-18);
}

export function peakAbs(samples: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > m || Number.isNaN(a)) m = a;
  }
  return m;
}
