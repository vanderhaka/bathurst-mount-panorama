import { h, s } from '@/hud/dom';
import { kmhToMph, unitLabel, type SpeedUnits } from '@/hud/format';
import type { LapTelemetry, TelemetrySample } from '@/types/telemetry';

/** SVG trace geometry is pure so the real lap values can be verified without a renderer. */
export function tracePath(lap: LapTelemetry, key: 'speedKmh' | 'throttle' | 'brake', max: number, units: SpeedUnits): string {
  const value = (sample: TelemetrySample): number => key === 'speedKmh' && units === 'mph' ? kmhToMph(sample[key]) : sample[key];
  return lap.samples.map((sample, i) => `${i === 0 ? 'M' : 'L'}${(40 + sample.distanceM / lap.lengthM * 740).toFixed(2)},${(84 - value(sample) / max * 70).toFixed(2)}`).join(' ');
}

export function telemetryChart(lap: LapTelemetry, reference: LapTelemetry, key: 'speedKmh' | 'throttle' | 'brake', units: SpeedUnits): HTMLElement {
  const speedMax = Math.max(1, ...lap.samples.map((s) => s.speedKmh), ...reference.samples.map((s) => s.speedKmh));
  const max = key === 'speedKmh' ? Math.ceil((units === 'mph' ? kmhToMph(speedMax) : speedMax) / 20) * 20 : 1;
  const label = key === 'speedKmh' ? `Speed (${unitLabel(units)})` : key === 'throttle' ? 'Throttle (%)' : 'Brake (%)';
  const svg = s('svg', { viewBox: '0 0 800 112', role: 'img', 'aria-label': `${label}, both laps over distance` }, [
    s('title', undefined, [`${label}: inspected lap and reference lap, timing line to timing line`]),
    ...[14, 49, 84].map((y) => s('line', { class: 'mn-trace__grid', x1: 40, x2: 780, y1: y, y2: y })),
    s('text', { class: 'mn-trace__axis', x: 32, y: 18, 'text-anchor': 'end' }, [String(key === 'speedKmh' ? max : 100)]),
    s('text', { class: 'mn-trace__axis', x: 32, y: 88, 'text-anchor': 'end' }, ['0']),
    s('text', { class: 'mn-trace__axis', x: 40, y: 106 }, ['0 m']),
    s('text', { class: 'mn-trace__axis', x: 780, y: 106, 'text-anchor': 'end' }, [`${Math.round(lap.lengthM)} m`]),
    s('path', { class: 'mn-trace__reference', d: tracePath(reference, key, max, units) }),
    s('path', { class: 'mn-trace__lap', d: tracePath(lap, key, max, units) }),
  ]);
  return h('figure', 'mn-trace', undefined, [h('figcaption', undefined, undefined, [label]), svg]);
}
