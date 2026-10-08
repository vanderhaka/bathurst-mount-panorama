import type { CarKind } from '@/car/car-specs';
import { loadRecords } from '@/race/records';
import type { LapRecord } from '@/types/session';
import type { CircuitId } from '@/track/circuits';

/**
 * Results for a session on its circuit: the laps driven in this session (oldest first) and
 * the best lap of every car, from saved history plus this session (`laps` holds both).
 */
export function sessionResults(session: { car: CarKind; laps: readonly LapRecord[]; sessionLaps: readonly LapRecord[]; track?: { id: CircuitId } }): [LapRecord[], Partial<Record<CarKind, LapRecord>>] {
  const cars: CarKind[] = ['camaro', 'mustang', 'supra', 'torana'];
  const history = cars.flatMap((car) => car === session.car ? session.laps : loadRecords(car, session.track?.id)?.laps ?? []);
  const best: Partial<Record<CarKind, LapRecord>> = {};
  for (const lap of history) if (lap.valid && (!best[lap.car] || lap.timeS < best[lap.car]!.timeS)) best[lap.car] = lap;
  const laps = [...session.sessionLaps].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return [laps, best];
}
