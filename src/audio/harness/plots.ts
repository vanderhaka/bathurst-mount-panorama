import { fft, type Spectrum } from '@/audio/dsp/spectrum';

const F_MIN = 20;
const F_MAX = 12000;
const DB_MIN = -100;
const DB_MAX = -5;
const BG = '#0e1116';
const GRID = '#232a34';
const TEXT = '#8b97a7';

function ctx2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2d canvas unavailable');
  return c;
}

function xOf(hz: number, w: number): number {
  return (Math.log(hz / F_MIN) / Math.log(F_MAX / F_MIN)) * w;
}

function yOf(db: number, h: number): number {
  return h - ((Math.min(DB_MAX, Math.max(DB_MIN, db)) - DB_MIN) / (DB_MAX - DB_MIN)) * h;
}

/** Peak dB of `spec` within a frequency band (so narrow peaks survive pixel decimation). */
function bandDb(spec: Spectrum, f0: number, f1: number): number {
  const k0 = Math.max(1, Math.floor(f0 / spec.binHz));
  const k1 = Math.min(spec.mag.length - 1, Math.max(k0, Math.ceil(f1 / spec.binHz)));
  let m = 0;
  for (let k = k0; k <= k1; k++) m = Math.max(m, spec.mag[k]);
  return 20 * Math.log10(m + 1e-9);
}

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GRID;
  g.fillStyle = TEXT;
  g.font = '10px ui-monospace, Menlo, monospace';
  g.lineWidth = 1;
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    const x = Math.round(xOf(f, w)) + 0.5;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, h);
    g.stroke();
    g.fillText(f >= 1000 ? `${f / 1000}k` : `${f}`, x + 2, h - 3);
  }
  for (let db = -80; db <= -20; db += 20) {
    const y = Math.round(yOf(db, h)) + 0.5;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
    g.fillText(`${db} dB`, 3, y - 2);
  }
}

export interface SpectrumSeries {
  label: string;
  color: string;
  spectrum: Spectrum;
}

export interface Marker {
  hz: number;
  label: string;
  color: string;
}

/** Log-frequency spectrum overlay of one or more series with vertical frequency markers. */
export function drawSpectra(canvas: HTMLCanvasElement, series: readonly SpectrumSeries[], markers: readonly Marker[] = []): void {
  const g = ctx2d(canvas);
  const { width: w, height: h } = canvas;
  drawGrid(g, w, h);
  for (const m of markers) {
    const x = xOf(m.hz, w);
    g.strokeStyle = m.color;
    g.setLineDash([3, 3]);
    g.beginPath();
    g.moveTo(x, 12);
    g.lineTo(x, h - 12);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = m.color;
    g.fillText(m.label, x + 3, 22);
  }
  series.forEach((s, idx) => {
    g.strokeStyle = s.color;
    g.lineWidth = 1.4;
    g.beginPath();
    for (let x = 0; x < w; x++) {
      const f0 = F_MIN * Math.pow(F_MAX / F_MIN, x / w);
      const f1 = F_MIN * Math.pow(F_MAX / F_MIN, (x + 1) / w);
      const y = yOf(bandDb(s.spectrum, f0, f1), h);
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = s.color;
    g.fillText(s.label, w - 150, 14 + idx * 13);
  });
}

/** Live analyser spectrum (dB per bin) drawn on the same axes. */
export function drawLiveSpectrum(canvas: HTMLCanvasElement, analyser: AnalyserNode, markers: readonly Marker[]): void {
  const bins = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(bins);
  const mag = new Float64Array(bins.length);
  for (let i = 0; i < bins.length; i++) mag[i] = Math.pow(10, bins[i] / 20);
  const spectrum: Spectrum = { sampleRate: analyser.context.sampleRate, binHz: analyser.context.sampleRate / analyser.fftSize, mag };
  drawSpectra(canvas, [{ label: 'live', color: '#f2a65a', spectrum }], markers);
}

/** Time-domain oscilloscope, triggered on a rising zero crossing so periodic signals hold still. */
export function drawScope(canvas: HTMLCanvasElement, analyser: AnalyserNode): void {
  const g = ctx2d(canvas);
  const { width: w, height: h } = canvas;
  const data = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(data);
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = GRID;
  g.beginPath();
  g.moveTo(0, h / 2);
  g.lineTo(w, h / 2);
  g.stroke();
  let start = 0;
  for (let i = 1; i < data.length / 2; i++) {
    if (data[i - 1] < 0 && data[i] >= 0) {
      start = i;
      break;
    }
  }
  const span = Math.min(1500, data.length - start);
  g.strokeStyle = '#7bd88f';
  g.lineWidth = 1.2;
  g.beginPath();
  for (let i = 0; i < span; i++) {
    const x = (i / span) * w;
    const y = h / 2 - data[start + i] * (h / 2) * 0.95;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

/** Spectrogram image of a mono signal (log-ish dB colour ramp, time left to right, 0..6 kHz). */
export function drawSpectrogram(canvas: HTMLCanvasElement, samples: Float32Array, sampleRate: number): void {
  const g = ctx2d(canvas);
  const { width: w, height: h } = canvas;
  g.fillStyle = BG;
  g.fillRect(0, 0, w, h);
  const size = 2048;
  const maxHz = 6000;
  const bins = Math.floor((maxHz / sampleRate) * size);
  const hop = Math.max(1, Math.floor((samples.length - size) / w));
  const img = g.createImageData(w, h);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let x = 0; x < w; x++) {
    const start = Math.min(samples.length - size, x * hop);
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size));
      im[i] = 0;
    }
    fft(re, im);
    for (let y = 0; y < h; y++) {
      const k = Math.min(bins - 1, Math.floor(((h - 1 - y) / h) * bins));
      const db = 20 * Math.log10((Math.hypot(re[k], im[k]) * 2) / (size / 2) + 1e-9);
      const v = Math.min(1, Math.max(0, (db + 90) / 70));
      const o = (y * w + x) * 4;
      img.data[o] = 255 * Math.min(1, v * 1.6);
      img.data[o + 1] = 255 * Math.max(0, v * 1.5 - 0.5);
      img.data[o + 2] = 255 * Math.max(0, 0.45 - Math.abs(v - 0.35));
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = TEXT;
  g.font = '10px ui-monospace, Menlo, monospace';
  for (const f of [1000, 2000, 4000]) g.fillText(`${f / 1000}k`, 3, h - (f / maxHz) * h);
  g.fillText(`${(samples.length / sampleRate).toFixed(1)} s`, w - 40, h - 3);
}
