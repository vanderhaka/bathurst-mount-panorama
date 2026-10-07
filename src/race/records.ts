import type { CarKind } from '@/car/car-specs';
import { decodeGhost, encodeGhost, GhostPlayer } from '@/race/ghost';
import type { LapRecord } from '@/types/session';
import { restoreTelemetry, type LapTelemetry } from '@/types/telemetry';

// v2: v1 records could hold ghosts that replayed fast and fake bests from reversing over the line.
const KEY = (car: CarKind) => `bathurst.records.v2.${car}`;
/** No lap of the 6.2 km circuit is faster than this (a 223 km/h average). */
const MIN_PLAUSIBLE_LAP_S = 100;

export interface CarRecords {
  bestS: number;
  bestSectors: number[];
  trace?: number[];
  ghost?: Float32Array;
  telemetry?: LapTelemetry;
  laps: LapRecord[];
}

interface Stored {
  bestS: number;
  bestSectors: number[];
  trace?: number[];
  ghost?: string;
  telemetry?: unknown;
  laps: LapRecord[];
}

/** Best lap, sectors, delta trace, ghost and lap history per car (localStorage, best effort). */
export function loadRecords(car: CarKind): CarRecords | null {
  try {
    const raw = localStorage.getItem(KEY(car));
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    const laps = (s.laps ?? []).filter((l) => l.timeS >= MIN_PLAUSIBLE_LAP_S);
    if (!(typeof s.bestS === 'number' && s.bestS >= MIN_PLAUSIBLE_LAP_S)) return { bestS: Infinity, bestSectors: [], laps };
    const ghost = s.ghost ? decodeGhost(s.ghost) ?? undefined : undefined;
    // The ghost must last as long as the best lap it belongs to.
    const ghostOk = ghost && Math.abs(new GhostPlayer(ghost).duration - s.bestS) < 0.5;
    return { bestS: s.bestS, bestSectors: s.bestSectors, trace: s.trace, ghost: ghostOk ? ghost : undefined,
      telemetry: restoreTelemetry(s.telemetry, s.bestS) ?? undefined, laps };
  } catch {
    return null;
  }
}

/** Encoded ghosts by array: the ghost changes only on a new best lap, so most saves reuse it. */
const encoded = new WeakMap<Float32Array, string>();
function encodeCached(g: Float32Array): string {
  let e = encoded.get(g);
  if (e === undefined) { e = encodeGhost(g); encoded.set(g, e); }
  return e;
}

export function saveRecords(car: CarKind, r: CarRecords): void {
  try {
    const s: Stored = { bestS: r.bestS, bestSectors: r.bestSectors, trace: r.trace, ghost: r.ghost ? encodeCached(r.ghost) : undefined,
      telemetry: r.telemetry, laps: r.laps.slice(-50) };
    localStorage.setItem(KEY(car), JSON.stringify(s));
  } catch {
    /* storage full or unavailable: records stay for this session only */
  }
}
