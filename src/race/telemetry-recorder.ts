import type { LapResult } from '@/race/lap-timer';
import type { LapTelemetry, TelemetrySample } from '@/types/telemetry';

const SAMPLE_PERIOD_S = 0.1;

/** Ten samples per second, with exact timing-line endpoints from the lap timer. */
export class TelemetryRecorder {
  private samples: TelemetrySample[] = [];
  private previous: TelemetrySample | null = null;

  constructor(private readonly lengthM: number) {}

  reset(): void {
    this.samples = [];
    this.previous = null;
  }

  record(sample: TelemetrySample): void {
    if (!this.previous) return; // standing start / out lap has no complete flying trace
    this.previous = sample;
    const last = this.samples.at(-1)!;
    // First forward arrival at a distance; reversing and stops remain elapsed time in the next section.
    if (sample.distanceM > last.distanceM && sample.timeS - last.timeS >= SAMPLE_PERIOD_S - 1e-6) this.samples.push(sample);
  }

  /** `nextLap` and `after.timeS` are the timer's state immediately after a crossing. */
  cross(result: Pick<LapResult, 'timeS' | 'valid' | 'standing'> | null, nextLap: number, after: TelemetrySample): LapTelemetry | null {
    const before = this.previous;
    const fraction = before ? (this.lengthM - before.distanceM) / (this.lengthM - before.distanceM + after.distanceM) : 1;
    const blend = (key: 'speedKmh' | 'throttle' | 'brake'): number => before ? before[key] + (after[key] - before[key]) * fraction : after[key];
    const line: TelemetrySample = { distanceM: 0, timeS: 0, speedKmh: blend('speedKmh'), throttle: blend('throttle'), brake: blend('brake') };
    let completed: LapTelemetry | null = null;
    if (result && !result.standing && this.samples.length > 1) {
      completed = {
        lapNumber: nextLap - 1, lengthM: this.lengthM, timeS: result.timeS, valid: result.valid,
        samples: [...this.samples, { ...line, distanceM: this.lengthM, timeS: result.timeS }],
      };
    }
    this.samples = [line];
    this.previous = line;
    this.record(after);
    return completed;
  }
}
