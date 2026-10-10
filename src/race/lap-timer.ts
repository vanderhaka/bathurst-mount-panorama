import type { SectorState } from '@/types/hud';

/** Lap timing with sectors, live delta and validity. Distances are lap distances from the timing line. */
export interface LapResult {
  timeS: number;
  sectorsS: number[];
  valid: boolean;
  /** The standing-start lap (from the grid): shown, but never a best lap, delta reference or ghost. */
  standing: boolean;
}

export interface TimerSnapshot {
  lapNumber: number;
  currentS: number;
  lastS: number | null;
  bestS: number | null;
  deltaS: number | null;
  valid: boolean;
  currentSector: number;
  sectors: Array<{ timeS: number | null; bestS: number | null; state: SectorState }>;
}

const DELTA_STEP = 10; // metres between delta reference points
/** A crossing completes a lap only after this fraction of the lap was driven forwards since the last crossing. */
const MIN_COVERED = 0.9;

export class LapTimer {
  lapNumber = 0;
  lapTime = 0;
  valid = true;
  lastS: number | null = null;
  bestS: number | null = null;
  /** Number of forward crossings of the line (complete laps and restarts). */
  crossings = 0;
  /** Forward metres driven up to the line at the last crossing (a rolling start checks it was driven, not cut). */
  lineCovered = 0;
  /** Forward distance driven since the last crossing (big jumps such as teleports do not count). */
  private covered = 0;
  /** True during the standing-start lap. */
  private standing = false;
  private sectorTimes: Array<number | null>;
  private lastSectorTimes: Array<number | null>;
  private readonly bestSectors: Array<number | null>;
  private readonly sessionBestSectors: Array<number | null>;
  private sectorStates: SectorState[];
  private currentSector = 0;
  private sectorStart = 0;
  private prevDist = 0;
  /** Time at every DELTA_STEP metres of the current lap and of the best lap. */
  private curTrace: number[] = [];
  private bestTrace: number[] | null = null;

  constructor(
    readonly lapLength: number,
    /** Lap distances where sectors 2.. start. */
    readonly sectorStarts: number[],
    saved?: { bestS: number; bestSectors: number[]; trace?: number[] } | null,
  ) {
    const count = sectorStarts.length + 1;
    this.sectorTimes = new Array(count).fill(null);
    this.lastSectorTimes = new Array(count).fill(null);
    this.bestSectors = saved?.bestSectors?.slice(0, count) ?? new Array(count).fill(null);
    this.sessionBestSectors = new Array(count).fill(null);
    this.sectorStates = new Array(count).fill('none');
    if (saved) {
      this.bestS = saved.bestS;
      this.bestTrace = saved.trace ?? null;
    }
  }

  /** Changes to another saved best (a level's records): best lap, best sectors and delta trace follow it. */
  useRecord(saved: { bestS: number; bestSectors: number[]; trace?: number[] } | null): void {
    for (let i = 0; i < this.bestSectors.length; i++) {
      this.bestSectors[i] = saved?.bestSectors[i] ?? null;
      this.sessionBestSectors[i] = null;
    }
    this.bestS = saved ? saved.bestS : null;
    this.bestTrace = saved?.trace ?? null;
  }

  /** Call when the car is placed before the line (out lap). */
  startOutLap(lapDistance: number): void {
    this.lapNumber = 0;
    this.lapTime = 0;
    this.valid = true;
    this.prevDist = lapDistance;
    this.currentSector = 0;
    this.covered = 0;
    this.standing = false;
  }

  /** Standing start: lap 1 is timed from lights out at the grid. */
  startStandingLap(): void {
    this.lapNumber = 1;
    this.lapTime = 0;
    this.valid = true;
    this.covered = 0;
    this.standing = true;
  }

  invalidate(): void {
    this.valid = false;
  }

  /**
   * Advances time. `lapDist` is the car's distance from the timing line (0..lapLength).
   * Returns the completed lap when the line is crossed.
   */
  update(dt: number, lapDist: number): LapResult | null {
    let result: LapResult | null = null;
    this.lapTime += dt;
    let ds = lapDist - this.prevDist;
    if (ds < -this.lapLength / 2) ds += this.lapLength;
    else if (ds > this.lapLength / 2) ds -= this.lapLength;
    if (Math.abs(ds) < 50) this.covered += Math.max(0, ds);
    const crossed = this.prevDist > this.lapLength * 0.8 && lapDist < this.lapLength * 0.2;
    if (crossed) {
      // Interpolate the exact crossing time within this step.
      const before = this.lapLength - this.prevDist, total = before + lapDist;
      const frac = total > 0 ? before / total : 1;
      const tCross = this.lapTime - dt + dt * frac;
      // A short "lap" (reverse over the line and back) restarts the lap instead.
      this.lineCovered = this.covered - lapDist;
      const complete = this.lineCovered >= this.lapLength * MIN_COVERED;
      if (this.lapNumber > 0 && complete) result = this.finishLap(tCross);
      if (this.lapNumber === 0 || complete) this.lapNumber++;
      this.crossings++;
      this.covered = lapDist;
      this.standing = false;
      this.lapTime -= tCross;
      this.sectorStart = 0;
      this.currentSector = 0;
      this.sectorTimes = new Array(this.sectorTimes.length).fill(null);
      this.sectorStates = this.sectorStates.map(() => 'none');
      this.valid = true;
      this.curTrace = [0];
    } else if (this.lapNumber > 0) {
      const next = this.sectorStarts[this.currentSector];
      if (next !== undefined && this.prevDist < next && lapDist >= next && lapDist - this.prevDist < 100) this.closeSector(this.lapTime);
      const k = Math.floor(lapDist / DELTA_STEP);
      while (this.curTrace.length <= k && this.curTrace.length > 0 && lapDist - this.prevDist < 100) this.curTrace.push(this.lapTime);
    }
    this.prevDist = lapDist;
    return result;
  }

  private closeSector(t: number): void {
    const i = this.currentSector;
    const st = t - this.sectorStart;
    this.sectorTimes[i] = st;
    if (this.valid && !this.standing) {
      const pb = this.bestSectors[i];
      const sb = this.sessionBestSectors[i];
      this.sectorStates[i] = pb === null || st < pb ? 'overallBest' : sb === null || st < sb ? 'personalBest' : 'slower';
      if (pb === null || st < pb) this.bestSectors[i] = st;
      if (sb === null || st < sb) this.sessionBestSectors[i] = st;
    } else this.sectorStates[i] = this.standing ? 'none' : 'slower';
    this.sectorStart = t;
    this.currentSector = Math.min(this.sectorTimes.length - 1, i + 1);
  }

  private finishLap(t: number): LapResult {
    this.closeSector(t);
    const res: LapResult = { timeS: t, sectorsS: this.sectorTimes.map((x) => x ?? 0), valid: this.valid, standing: this.standing };
    this.lastS = t;
    this.lastSectorTimes = this.sectorTimes.slice();
    if (this.valid && !this.standing && (this.bestS === null || t < this.bestS)) {
      this.bestS = t;
      this.bestTrace = this.curTrace.slice();
    }
    return res;
  }

  /** Live delta to the best lap at this distance (s, + = slower); none on the out lap or the standing-start lap. */
  delta(lapDist: number): number | null {
    if (!this.bestTrace || this.lapNumber === 0 || this.standing) return null;
    const f = lapDist / DELTA_STEP;
    const k = Math.floor(f);
    if (k + 1 >= this.bestTrace.length) return null;
    const ref = this.bestTrace[k] + (this.bestTrace[k + 1] - this.bestTrace[k]) * (f - k);
    return this.lapTime - ref;
  }

  snapshot(lapDist: number): TimerSnapshot {
    return {
      lapNumber: this.lapNumber,
      currentS: this.lapNumber === 0 ? 0 : this.lapTime,
      lastS: this.lastS,
      bestS: this.bestS,
      deltaS: this.delta(lapDist),
      valid: this.valid,
      currentSector: this.currentSector,
      sectors: this.sectorTimes.map((t, i) => ({ timeS: t ?? this.lastSectorTimes[i], bestS: this.bestSectors[i], state: t === null ? 'none' : this.sectorStates[i] })),
    };
  }

  /** Data to persist the personal best. */
  saveData(): { bestS: number; bestSectors: number[]; trace?: number[] } | null {
    if (this.bestS === null) return null;
    return { bestS: this.bestS, bestSectors: this.bestSectors.map((x) => x ?? 0), trace: this.bestTrace ?? undefined };
  }
}
