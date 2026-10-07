import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import { sampleArray, type SurfaceKind } from '@/track/track-query';

/** The existing rendered groove: a 1.25 m Gaussian around the sampled racing line. */
export function rubberAmount(lineOffset: number, d: number): number {
  return Math.exp(-(((d - lineOffset) / 1.25) ** 2));
}

/** One session's track condition. Small bounded gains preserve the calibrated car. */
export class TrackGrip {
  private runningS = 0;
  constructor(private readonly track: Track, readonly line: RacingLine) {}

  at(index: number, t: number, d: number, surface: SurfaceKind): number {
    if (surface !== 'road') return 1;
    const rubber = rubberAmount(sampleArray(this.track, this.line.offset, index, t), d);
    return 0.99 + (0.015 + 0.015 * this.runningS / 1200) * rubber;
  }

  advance(dt: number, speed: number): void {
    if (!(Number.isFinite(dt) && dt > 0 && Number.isFinite(speed) && Math.abs(speed) > 5)) return;
    this.runningS = Math.min(1200, this.runningS + dt);
  }

  reset(): void { this.runningS = 0; }
}
