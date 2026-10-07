import type { LapTelemetry, TelemetryCorner, TelemetrySample } from '@/types/telemetry';

export interface CornerDelta extends TelemetryCorner {
  fromM: number;
  toM: number;
  deltaS: number;
  /** Rounded boundary differences conserve the displayed millisecond lap delta too. */
  deltaMs: number;
}

export interface LapComparison {
  lapDeltaS: number;
  corners: CornerDelta[];
}

export function sampleAtDistance(lap: LapTelemetry, distanceM: number): TelemetrySample {
  const samples = lap.samples;
  if (distanceM <= 0) return samples[0];
  if (distanceM >= lap.lengthM) return samples.at(-1)!;
  let low = 0, high = samples.length - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (samples[mid].distanceM <= distanceM) low = mid;
    else high = mid;
  }
  const a = samples[low], b = samples[high];
  const f = (distanceM - a.distanceM) / (b.distanceM - a.distanceM);
  const lerp = (key: 'timeS' | 'speedKmh' | 'throttle' | 'brake'): number => a[key] + (b[key] - a[key]) * f;
  return { distanceM, timeS: lerp('timeS'), speedKmh: lerp('speedKmh'), throttle: lerp('throttle'), brake: lerp('brake') };
}

/** Midpoints between apex markers partition the whole lap, assigning nearby straights to each turn. */
export function compareLaps(lap: LapTelemetry, reference: LapTelemetry, markers: readonly TelemetryCorner[]): LapComparison {
  if (Math.abs(lap.lengthM - reference.lengthM) > 0.01) throw new Error('Telemetry laps use different circuit lengths');
  const corners = markers.filter((c) => c.distanceM >= 0 && c.distanceM < lap.lengthM).sort((a, b) => a.distanceM - b.distanceM);
  const bounds = [0, ...corners.slice(1).map((c, i) => (corners[i].distanceM + c.distanceM) / 2), lap.lengthM];
  const delta = (distance: number): number => sampleAtDistance(lap, distance).timeS - sampleAtDistance(reference, distance).timeS;
  const deltas = bounds.map(delta);
  return {
    lapDeltaS: lap.timeS - reference.timeS,
    corners: corners.map((c, i) => ({ ...c, fromM: bounds[i], toM: bounds[i + 1], deltaS: deltas[i + 1] - deltas[i], deltaMs: Math.round(deltas[i + 1] * 1000) - Math.round(deltas[i] * 1000) })),
  };
}
