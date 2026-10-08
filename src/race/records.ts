import type { CarKind } from '@/car/car-specs';
import { decodeGhost, encodeGhost, GhostPlayer } from '@/race/ghost';
import type { LapRecord } from '@/types/session';
import { compactTelemetry, restoreTelemetry, type LapTelemetry } from '@/types/telemetry';
import { CIRCUITS, type CircuitId } from '@/track/circuits';

// v2: v1 records could hold ghosts that replayed fast and fake bests from reversing over the line.
const KEY = (car: CarKind, circuit: CircuitId) => `${circuit}.records.v2.${car}`;
/** Per circuit; rejects corrupt or impossible times. */
const MIN_PLAUSIBLE_LAP_S: Record<CircuitId, number> = { bathurst: 100, adelaide: 50 };

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
export function loadRecords(car: CarKind, circuit: CircuitId = 'bathurst'): CarRecords | null {
  try {
    const raw = localStorage.getItem(KEY(car, circuit));
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored;
    const laps = (s.laps ?? []).filter((l) => l.timeS >= MIN_PLAUSIBLE_LAP_S[circuit]);
    if (!(typeof s.bestS === 'number' && s.bestS >= MIN_PLAUSIBLE_LAP_S[circuit])) return { bestS: Infinity, bestSectors: [], laps };
    const ghost = s.ghost ? decodeGhost(s.ghost) ?? undefined : undefined;
    // The ghost must last as long as the best lap it belongs to.
    const ghostOk = ghost && Math.abs(new GhostPlayer(ghost).duration - s.bestS) < 0.5;
    return { bestS: s.bestS, bestSectors: s.bestSectors, trace: s.trace, ghost: ghostOk ? ghost : undefined,
      telemetry: restoreTelemetry(s.telemetry, s.bestS, CIRCUITS[circuit].lengthM) ?? undefined, laps };
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

/**
 * A Bathurst record with ghost and pedal trace is ~0.25 M characters. When storage is full,
 * the best time, sectors and lap history still persist: the trace is dropped first, then the ghost.
 */
export function saveRecords(car: CarKind, r: CarRecords, circuit: CircuitId = 'bathurst'): void {
  const full: Stored = { bestS: r.bestS, bestSectors: r.bestSectors, trace: r.trace, ghost: r.ghost ? encodeCached(r.ghost) : undefined,
    telemetry: r.telemetry ? compactTelemetry(r.telemetry) : undefined, laps: r.laps.slice(-50) };
  for (const s of [full, { ...full, telemetry: undefined }, { ...full, telemetry: undefined, ghost: undefined }]) {
    try {
      localStorage.setItem(KEY(car, circuit), JSON.stringify(s));
      return;
    } catch {
      /* storage full (try a smaller record) or unavailable: records stay for this session only */
    }
  }
}
