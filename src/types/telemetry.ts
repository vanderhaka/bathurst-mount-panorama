/** Actual vehicle values, aligned by distance from the timing line. */
export interface TelemetrySample {
  distanceM: number;
  timeS: number;
  speedKmh: number;
  throttle: number;
  brake: number;
}

export interface LapTelemetry {
  lapNumber: number;
  lengthM: number;
  timeS: number;
  valid: boolean;
  samples: TelemetrySample[];
}

export interface TelemetryCorner {
  distanceM: number;
  turn: number;
  name: string;
}

export interface SessionTelemetry {
  laps: readonly LapTelemetry[];
  /** The best lap, which the ghost replays; null when it has no pedal trace (saved by older versions). */
  best: LapTelemetry | null;
  corners: TelemetryCorner[];
}

const round = (value: number, places: number): number => Math.round(value * 10 ** places) / 10 ** places;

/**
 * The saved form of a lap trace, about 40 % smaller: interior samples rounded to
 * 1 mm, 0.1 ms, 0.01 km/h and 0.1 % pedal, and dropped where rounding would break the
 * strictly increasing distance and time restoreTelemetry requires. The timing-line
 * endpoints keep their exact distance and time.
 */
export function compactTelemetry(lap: LapTelemetry): LapTelemetry {
  if (lap.samples.length < 3) return lap;
  const at = (s: TelemetrySample, distanceM: number, timeS: number): TelemetrySample =>
    ({ distanceM, timeS, speedKmh: round(s.speedKmh, 2), throttle: round(s.throttle, 3), brake: round(s.brake, 3) });
  const first = lap.samples[0], last = lap.samples[lap.samples.length - 1];
  const samples = [at(first, first.distanceM, first.timeS)];
  for (let i = 1; i < lap.samples.length - 1; i++) {
    const prev = samples[samples.length - 1], d = round(lap.samples[i].distanceM, 3), t = round(lap.samples[i].timeS, 4);
    if (d > prev.distanceM && t > prev.timeS && d < last.distanceM && t < last.timeS) samples.push(at(lap.samples[i], d, t));
  }
  samples.push(at(last, last.distanceM, last.timeS));
  return { ...lap, samples };
}

/** Read saved data defensively; never manufacture inputs for a legacy ghost. */
export function restoreTelemetry(value: unknown, bestS: number, lengthM?: number): LapTelemetry | null {
  if (!value || typeof value !== 'object') return null;
  const lap = value as Partial<LapTelemetry>;
  if (!Number.isFinite(lap.lengthM) || !Number.isFinite(lap.timeS) || lap.timeS !== bestS || lap.valid !== true ||
      !Number.isInteger(lap.lapNumber) || (lap.lapNumber ?? 0) < 1 || (lap.lengthM ?? 0) <= 0 ||
      (lengthM !== undefined && Math.abs((lap.lengthM ?? 0) - lengthM) > 0.01) ||
      !Array.isArray(lap.samples) || lap.samples.length < 2 || lap.samples.length > 10000) return null;
  let distance = -1, time = -1;
  for (const sample of lap.samples) {
    if (!sample || typeof sample !== 'object' || !Number.isFinite(sample.distanceM) || !Number.isFinite(sample.timeS) ||
        !Number.isFinite(sample.speedKmh) || !Number.isFinite(sample.throttle) || !Number.isFinite(sample.brake) ||
        sample.distanceM <= distance || sample.timeS <= time || sample.speedKmh < 0 || sample.speedKmh > 500 ||
        sample.throttle < 0 || sample.throttle > 1 || sample.brake < 0 || sample.brake > 1) return null;
    distance = sample.distanceM;
    time = sample.timeS;
  }
  const first = lap.samples[0], last = lap.samples.at(-1)!;
  if (first.distanceM !== 0 || first.timeS !== 0 || last.distanceM !== lap.lengthM || last.timeS !== lap.timeS) return null;
  return lap as LapTelemetry;
}
