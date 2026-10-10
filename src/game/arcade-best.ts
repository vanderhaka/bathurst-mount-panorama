// Shootout Arcade personal best per car (this browser only, best effort): time, sectors, delta trace and ghost.
// Separate from the time-trial records, which Arcade never writes.
import { decodeGhost, encodeGhost, GhostPlayer } from '@/race/ghost';
import type { ShootoutCar } from '@/shootout/model';

const KEY = (car: ShootoutCar) => `bathurst.shootoutArcade.best.v1.${car}`;

export interface ArcadeBest {
  timeS: number;
  sectorsS: number[];
  trace?: number[];
  ghost?: Float32Array;
}

/** What the result screen shows for a practice lap: the best now, and this lap against the best before it. */
export interface PracticeSummary {
  bestS: number | null;
  /** This lap minus the previous best (- = faster); null without a valid lap and a previous best. */
  deltaS: number | null;
  improved: boolean;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

export function loadArcadeBest(car: ShootoutCar): ArcadeBest | null {
  try {
    const raw = localStorage.getItem(KEY(car));
    if (!raw) return null;
    const data = JSON.parse(raw) as { timeS?: unknown; sectorsS?: unknown; trace?: unknown; ghost?: unknown } | null;
    if (!data || !finite(data.timeS) || !Array.isArray(data.sectorsS) || !data.sectorsS.every(finite)) return null;
    const trace = Array.isArray(data.trace) && data.trace.every((t) => typeof t === 'number' && Number.isFinite(t)) ? data.trace as number[] : undefined;
    const ghost = typeof data.ghost === 'string' ? decodeGhost(data.ghost) ?? undefined : undefined;
    // As time-trial records: a ghost must last as long as the lap it belongs to.
    const ghostOk = ghost && Math.abs(new GhostPlayer(ghost).duration - data.timeS) < 0.5;
    return { timeS: data.timeS, sectorsS: data.sectorsS as number[], trace, ghost: ghostOk ? ghost : undefined };
  } catch { return null; }
}

function saveArcadeBest(car: ShootoutCar, best: ArcadeBest): void {
  const full = { timeS: best.timeS, sectorsS: best.sectorsS, trace: best.trace, ghost: best.ghost ? encodeGhost(best.ghost) : undefined };
  // A full browser keeps at least the time: the ghost is dropped first.
  for (const entry of [full, { ...full, ghost: undefined }]) {
    try { localStorage.setItem(KEY(car), JSON.stringify(entry)); return; } catch { /* storage full or blocked */ }
  }
}

/** Compares a finished practice lap with the stored best and saves it when faster. `lap` null: an invalid lap. */
export function recordArcadeLap(car: ShootoutCar, lap: ArcadeBest | null): PracticeSummary {
  const previous = loadArcadeBest(car);
  if (!lap) return { bestS: previous?.timeS ?? null, deltaS: null, improved: false };
  const improved = !previous || lap.timeS < previous.timeS;
  if (improved) saveArcadeBest(car, lap);
  return { bestS: improved ? lap.timeS : previous.timeS, deltaS: previous ? lap.timeS - previous.timeS : null, improved };
}
