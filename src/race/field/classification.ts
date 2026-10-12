// Running order rows for the HUD and the results: RaceOrder standings joined with who each runner is.
import type { CarKind } from '@/car/car-specs';
import type { RaceRunner, Standing } from '@/race/field/race-order';
import type { RaceRow } from '@/types/race';

export interface Runner extends RaceRunner { car: CarKind }

/**
 * One row per car in finishing/running order. A car that has not finished when the leader has will be flagged at its
 * next line crossing (RaceOrder), so that crossing is its last lap: laps down = laps - (laps done + 1). A gap is
 * shown only for cars on the leader's lap.
 */
export function buildRows(standings: readonly Standing[], runners: readonly Runner[], laps: number): RaceRow[] {
  const leaderDone = standings.length > 0 && standings[0].finished;
  return standings.map((st) => {
    const runner = runners[st.index];
    const lapsDown = st.finished ? st.lapsDown : leaderDone ? Math.max(0, laps - st.lapsDone - 1) : 0;
    return {
      position: st.position, number: runner.number, name: runner.name, car: runner.car, isPlayer: runner.isPlayer,
      lapsDone: st.lapsDone, finished: st.finished, finishTimeS: st.finishTimeS,
      gapS: st.position === 1 || lapsDown > 0 ? null : st.gapS, lapsDown, bestLapS: st.bestLapS,
    };
  });
}
