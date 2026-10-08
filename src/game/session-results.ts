import type { CarKind } from '@/car/car-specs';
import { loadRecords } from '@/race/records';
import type { DrivingLevel, LapRecord } from '@/types/session';
import type { CircuitId } from '@/track/circuits';

/**
 * Results for a session on its circuit: the laps driven in this session (oldest first), the
 * best lap of every car at the session's driving level (saved history plus this session; `laps`
 * holds both for the session's car) and that level.
 */
export function sessionResults(session: { car: CarKind; laps: readonly LapRecord[]; sessionLaps: readonly LapRecord[]; track?: { id: CircuitId }; level?: DrivingLevel }): [LapRecord[], Partial<Record<CarKind, LapRecord>>, DrivingLevel] {
  const level = session.level ?? 'experienced';
  const cars: CarKind[] = ['camaro', 'mustang', 'supra', 'torana'];
  const history = cars.flatMap((car) => car === session.car ? session.laps : loadRecords(car, session.track?.id, level)?.laps ?? []);
  const best: Partial<Record<CarKind, LapRecord>> = {};
  for (const lap of history) if (lap.valid && (!best[lap.car] || lap.timeS < best[lap.car]!.timeS)) best[lap.car] = lap;
  const laps = [...session.sessionLaps].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return [laps, best, level];
}
