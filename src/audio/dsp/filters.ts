import { softClip } from '@/audio/dsp/math';

/** Zavalishin topology-preserving state-variable filter; stable under fast modulation. */
export class Svf {
  private ic1 = 0;
  private ic2 = 0;
  private a1 = 0;
  private a2 = 0;
  private a3 = 0;
  private k = 1;

  constructor(private readonly sampleRate: number) {}

  set(freqHz: number, q: number): void {
    const f = Math.min(freqHz, this.sampleRate * 0.45);
    const g = Math.tan((Math.PI * f) / this.sampleRate);
    this.k = 1 / q;
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  /** Band-pass output with unity gain at the centre frequency. */
  bandpass(x: number): number {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    return v1 * this.k;
  }

  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
  }
}

/** One-pole high-pass used to remove DC and sub-audio drift. */
export class DcBlocker {
  private x1 = 0;
  private y1 = 0;
  private readonly r: number;

  constructor(sampleRate: number, cutoffHz = 20) {
    this.r = 1 - (2 * Math.PI * cutoffHz) / sampleRate;
  }

  process(x: number): number {
    const y = x - this.x1 + this.r * this.y1;
    this.x1 = x;
    this.y1 = y;
    return y;
  }
}

/** Feedback comb with a damping low-pass in the loop: a lossy pipe with end reflection. */
export class DampedComb {
  private readonly buf: Float32Array;
  private readonly delay: number;
  private readonly damp: number;
  private w = 0;
  private lp = 0;

  constructor(
    sampleRate: number,
    delayMs: number,
    private readonly feedback: number,
    dampHz: number,
  ) {
    this.delay = Math.max(2, Math.round((delayMs * sampleRate) / 1000));
    this.buf = new Float32Array(this.delay + 2);
    this.damp = 1 - Math.exp((-2 * Math.PI * dampHz) / sampleRate);
  }

  process(x: number): number {
    const len = this.buf.length;
    const r = (this.w - this.delay + len) % len;
    this.lp += this.damp * (this.buf[r] - this.lp);
    const y = x + this.feedback * this.lp;
    this.buf[this.w] = y;
    this.w = (this.w + 1) % len;
    return y;
  }
}

/** Per-sample one-pole low-pass coefficient for a cutoff in Hz. */
export function onePoleCoef(cutoffHz: number, sampleRate: number): number {
  return 1 - Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
}

/** Saturator that is unity-gain for small signals; `drive` sets how hard it bites. */
export function saturate(x: number, drive: number): number {
  return softClip(x * drive) / drive;
}
