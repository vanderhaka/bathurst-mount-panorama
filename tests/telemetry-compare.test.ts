import { describe, expect, it } from 'vitest';
import { compareLaps, sampleAtDistance } from '@/race/telemetry-compare';
import { TelemetryRecorder } from '@/race/telemetry-recorder';
import type { LapTelemetry, TelemetrySample } from '@/types/telemetry';

const sample = (distanceM: number, timeS: number, throttle = 1, brake = 0): TelemetrySample => ({ distanceM, timeS, speedKmh: 180 - brake * 100, throttle, brake });
const lap = (timeS: number, samples: TelemetrySample[]): LapTelemetry => ({ lapNumber: 2, lengthM: 1000, timeS, valid: true, samples });

describe('distance-based lap comparison', () => {
  const reference = lap(100, [sample(0, 0), sample(200, 20), sample(700, 70, 0.3, 0.5), sample(1000, 100)]);
  const driven = lap(102, [sample(0, 0), sample(300, 27), sample(600, 63, 0.2, 0.7), sample(1000, 102)]);
  const corners = [{ distanceM: 200, turn: 1, name: 'First' }, { distanceM: 600, turn: 2, name: 'Second' }, { distanceM: 900, turn: 3, name: 'Last' }];

  it('interpolates actual inputs at the same distance despite different sample times', () => {
    const at = sampleAtDistance(reference, 450);
    expect(at.timeS).toBeCloseTo(45, 9);
    expect(at.throttle).toBeCloseTo(0.65, 9);
    expect(at.brake).toBeCloseTo(0.25, 9);
    expect(at.speedKmh).toBeCloseTo(155, 9);
  });

  it('allocates the whole lap to corner sections, including straights, with gains and losses', () => {
    const result = compareLaps(driven, reference, corners);
    expect(result.lapDeltaS).toBe(2);
    expect(result.corners.map((c) => [c.fromM, c.toM])).toEqual([[0, 400], [400, 750], [750, 1000]]);
    expect(result.corners[0].deltaS).toBeCloseTo(-1, 9);
    expect(result.corners[1].deltaS).toBeCloseTo(3.625, 9);
    expect(result.corners[2].deltaS).toBeCloseTo(-0.625, 9);
    expect(result.corners.reduce((sum, c) => sum + c.deltaS, 0)).toBeCloseTo(result.lapDeltaS, 12);
    expect(compareLaps(reference, driven, corners).corners.reduce((sum, c) => sum + c.deltaS, 0)).toBeCloseTo(-2, 12);
  });

  it('keeps displayed millisecond corner totals equal to the displayed lap delta', () => {
    const uneven = lap(102.0006, driven.samples.map((s) => ({ ...s, timeS: s.timeS * 102.0006 / 102 })));
    const result = compareLaps(uneven, reference, corners);
    expect(result.corners.reduce((sum, c) => sum + c.deltaMs, 0)).toBe(Math.round(result.lapDeltaS * 1000));
  });
});

describe('real lap telemetry capture', () => {
  it('seeds the timing line and finishes at the interpolated crossing, then records the next lap remainder', () => {
    const recorder = new TelemetryRecorder(1000);
    recorder.cross(null, 1, sample(5, 0.5, 0.2)); // out lap is not a completed trace
    recorder.record(sample(400, 40, 0.7));
    recorder.record(sample(990, 99, 0.4, 0.5));
    const completed = recorder.cross({ timeS: 100, valid: true, standing: false }, 2, sample(10, 1, 0.8, 0.1));
    expect(completed?.timeS).toBe(100);
    expect(completed?.samples[0]).toEqual(sample(0, 0, 0.2));
    expect(completed?.samples.at(-1)?.distanceM).toBe(1000);
    expect(completed?.samples.at(-1)?.timeS).toBe(100);
    expect(completed?.samples.at(-1)?.throttle).toBeCloseTo(0.6, 9);
    recorder.record(sample(990, 99, 1));
    const next = recorder.cross({ timeS: 100, valid: false, standing: false }, 3, sample(10, 1));
    expect(next?.lapNumber).toBe(2);
    expect(next?.valid).toBe(false);
    expect(next?.samples[0].throttle).toBeCloseTo(0.6, 9);
  });

  it('does not turn standing starts or a short line restart into flying-lap data', () => {
    const recorder = new TelemetryRecorder(1000);
    recorder.record(sample(900, 90)); // no forward timing-line start
    expect(recorder.cross({ timeS: 98, valid: true, standing: true }, 2, sample(10, 1))).toBeNull();
    recorder.record(sample(25, 3));
    expect(recorder.cross(null, 2, sample(5, 0.5))).toBeNull();
  });

  it('retains time lost reversing without inserting backward distances into a trace', () => {
    const recorder = new TelemetryRecorder(1000);
    recorder.cross(null, 1, sample(10, 1));
    recorder.record(sample(500, 50));
    recorder.record(sample(400, 60, 0, 1));
    recorder.record(sample(600, 80));
    recorder.record(sample(990, 119));
    const result = recorder.cross({ timeS: 120, valid: true, standing: false }, 2, sample(10, 1))!;
    expect(result.samples.map((s) => s.distanceM)).toEqual([0, 10, 500, 600, 990, 1000]);
    expect(sampleAtDistance(result, 600).timeS).toBe(80);
  });

  it('starts a fresh capture after restart without retaining partial samples', () => {
    const recorder = new TelemetryRecorder(1000);
    recorder.cross(null, 1, sample(10, 1));
    recorder.record(sample(500, 50));
    recorder.reset();
    recorder.record(sample(800, 10));
    expect(recorder.cross(null, 1, sample(10, 1))).toBeNull();
    recorder.record(sample(990, 99));
    const result = recorder.cross({ timeS: 100, valid: true, standing: false }, 2, sample(10, 1))!;
    expect(result.samples.some((s) => s.distanceM === 500)).toBe(false);
  });
});
