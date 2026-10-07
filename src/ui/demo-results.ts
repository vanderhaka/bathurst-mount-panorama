// Fake session for the harness results screen.
import type { CarKind } from '@/car/car-specs';
import type { LapRecord } from '@/types/session';

export function demoLaps(): { laps: LapRecord[]; best: Partial<Record<CarKind, LapRecord>> } {
  const raw: Array<[CarKind, number, number, number, boolean]> = [
    ['camaro', 43.912, 44.208, 41.884, true],
    ['camaro', 42.105, 42.977, 40.731, true],
    ['camaro', 41.877, 43.402, 40.519, false],
    ['camaro', 41.596, 42.684, 40.623, true],
    ['mustang', 42.518, 43.109, 40.902, true],
    ['mustang', 41.733, 42.451, 40.288, true],
    ['mustang', 41.802, 42.995, 40.411, true],
  ];
  const laps: LapRecord[] = raw.map(([car, a, b, c, valid], i) => ({
    car,
    timeS: a + b + c,
    sectorsS: [a, b, c],
    valid,
    dateIso: new Date(Date.UTC(2026, 9, 7, 4, i * 3)).toISOString(),
  }));
  const best: Partial<Record<CarKind, LapRecord>> = {};
  for (const lap of laps) {
    if (!lap.valid) continue;
    const cur = best[lap.car];
    if (!cur || lap.timeS < cur.timeS) best[lap.car] = lap;
  }
  return { laps, best };
}
