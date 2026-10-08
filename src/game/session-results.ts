import type { CarKind } from '@/car/car-specs';
import { loadRecords } from '@/race/records';
import type { LapRecord } from '@/types/session';
import type { CircuitId } from '@/track/circuits';

/** Current laps plus other cars' saved history, using the existing results contract. */
export function sessionResults(session: { car: CarKind; laps: LapRecord[]; track?: { id: CircuitId } }): [LapRecord[], Partial<Record<CarKind, LapRecord>>] {
  const cars: CarKind[] = ['camaro', 'mustang', 'supra'];
  const laps = cars.flatMap((car) => car === session.car ? session.laps : loadRecords(car, session.track?.id)?.laps ?? []);
  const best: Partial<Record<CarKind, LapRecord>> = {};
  for (const lap of laps) if (lap.valid && (!best[lap.car] || lap.timeS < best[lap.car]!.timeS)) best[lap.car] = lap;
  return [laps, best];
}
