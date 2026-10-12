// Race positions, laps and finish times from each car's lap distance. Pure logic: progress is unwrapped
// distance from the timing line (negative until the first crossing), so reversing over the line cannot
// score a lap and the same maths orders cars on the grid.
export interface RaceRunner { id: string; name: string; number: string; isPlayer: boolean }

export interface Standing {
  index: number;
  runner: RaceRunner;
  /** 1-based. */
  position: number;
  lapsDone: number;
  /** Metres from the timing line along the way driven; negative until the first crossing. */
  progressM: number;
  finished: boolean;
  finishTimeS: number | null;
  /** Seconds behind the leader; null for the leader or when unknown. */
  gapS: number | null;
  /** Laps behind the leader's laps (only once finished a lap down). */
  lapsDown: number;
  bestLapS: number | null;
}

/** A step larger than this is a teleport (reset, grid placement), not driving. */
const MAX_STEP_M = 200;
/** Spacing of the progress-to-time samples used for gaps. */
const SAMPLE_M = 25;
/** A start this far past the timing line or less is a grid already on lap 1. */
const GRID_PAST_LINE_M = 500;

interface State {
  lastS: number | null;
  lastT: number;
  progress: number;
  /** Highest line crossing counted (0 = started lap 1, k = k laps complete); -1 before the start. */
  crossed: number;
  lapStartT: number | null;
  bestLapS: number | null;
  finishTimeS: number | null;
  finishSeq: number;
  lapsDown: number;
  /** Time at which progress reached j * SAMPLE_M - trackLength (indexed by j); undefined if unseen. */
  samples: number[];
  lastSample: number;
}

export class RaceOrder {
  private readonly st: State[];
  private finishCount = 0;
  private leaderFinishT: number | null = null;

  constructor(
    private readonly trackLength: number,
    private readonly startLineS: number,
    private readonly laps: number,
    private readonly runners: RaceRunner[],
  ) {
    this.st = runners.map(() => ({
      lastS: null, lastT: 0, progress: 0, crossed: -1, lapStartT: null, bestLapS: null,
      finishTimeS: null, finishSeq: -1, lapsDown: 0, samples: [], lastSample: -1,
    }));
  }

  /** Call after each game-logic step for every car: s = car.tp.s, t = race clock (s since lights out). */
  update(index: number, s: number, t: number): void {
    const st = this.st[index];
    if (st.lastS === null) { this.init(st, s); st.lastT = t; return; }
    const delta = this.wrapDelta(s - st.lastS);
    const t0 = st.lastT, p0 = st.progress;
    st.lastS = s;
    st.lastT = t;
    if (Math.abs(delta) >= MAX_STEP_M) return;
    st.progress = p0 + delta;
    if (delta > 0) this.crossings(st, p0, st.progress, t0, t);
  }

  /** Places a runner without counting progress. The first call sets the starting progress behind the line. */
  place(index: number, s: number): void {
    const st = this.st[index];
    if (st.lastS === null) this.init(st, s);
    st.lastS = s;
  }

  standings(): readonly Standing[] {
    const order = this.st.map((_, i) => i).sort((a, b) => this.compare(a, b));
    const leader = this.st[order[0]];
    return order.map((index, rank) => {
      const st = this.st[index];
      const finished = st.finishTimeS !== null;
      let gapS: number | null = null;
      if (rank > 0) {
        if (finished && leader.finishTimeS !== null) gapS = st.finishTimeS! - leader.finishTimeS;
        else if (!finished) gapS = this.gapTo(leader, st);
      }
      return {
        index, runner: this.runners[index], position: rank + 1, lapsDone: Math.max(0, st.crossed),
        progressM: st.progress, finished, finishTimeS: st.finishTimeS, gapS, lapsDown: st.lapsDown, bestLapS: st.bestLapS,
      };
    });
  }

  position(index: number): number {
    return this.standings().find((x) => x.index === index)!.position;
  }

  lapsDone(index: number): number { return Math.max(0, this.st[index].crossed); }

  finished(index: number): boolean { return this.st[index].finishTimeS !== null; }

  get leaderFinished(): boolean { return this.leaderFinishT !== null; }

  get allFinished(): boolean { return this.st.every((x) => x.finishTimeS !== null); }

  private init(st: State, s: number): void {
    // A grid just past the timing line (Bathurst) is already on lap 1: the first crossing completes a short
    // lap 1, as in real racing, and that partial lap never counts as a best lap. Otherwise the car starts behind the line.
    const ahead = this.wrapAround(s - this.startLineS);
    const onLap1 = ahead < Math.min(GRID_PAST_LINE_M, this.trackLength / 10);
    st.progress = onLap1 ? ahead : ahead - this.trackLength;
    if (onLap1) st.crossed = 0;
    st.lastS = s;
  }

  private wrapAround(x: number): number {
    return ((x % this.trackLength) + this.trackLength) % this.trackLength;
  }

  private wrapDelta(d: number): number {
    return this.wrapAround(d + this.trackLength / 2) - this.trackLength / 2;
  }

  /** Counts line crossings and 25 m samples between two progress values, interpolating the time. */
  private crossings(st: State, p0: number, p1: number, t0: number, t1: number): void {
    const L = this.trackLength;
    const at = (p: number) => t0 + ((p - p0) / (p1 - p0)) * (t1 - t0);
    for (let j = Math.floor((p0 + L) / SAMPLE_M) + 1; j * SAMPLE_M - L <= p1; j++) {
      if (j > st.lastSample && j >= 0) { st.samples[j] = at(j * SAMPLE_M - L); st.lastSample = j; }
    }
    if (st.finishTimeS !== null) return;
    for (let k = Math.floor(p0 / L) + 1; k * L <= p1; k++) {
      if (k <= st.crossed) continue;
      const tc = at(k * L);
      st.crossed = k;
      if (st.lapStartT !== null) st.bestLapS = Math.min(st.bestLapS ?? Infinity, tc - st.lapStartT);
      st.lapStartT = tc;
      // The flag falls on whoever completes the distance first, then on each car's next crossing.
      const flag = k >= this.laps || (this.leaderFinishT !== null && tc >= this.leaderFinishT && k >= 1);
      if (!flag) continue;
      st.finishTimeS = tc;
      st.finishSeq = this.finishCount++;
      st.lapsDown = Math.max(0, this.laps - k);
      if (this.leaderFinishT === null) this.leaderFinishT = tc;
      return;
    }
  }

  private compare(a: number, b: number): number {
    const x = this.st[a], y = this.st[b];
    const fx = x.finishSeq >= 0, fy = y.finishSeq >= 0;
    if (fx !== fy) return fx ? -1 : 1;
    if (fx) return x.finishSeq - y.finishSeq;
    return y.progress - x.progress || a - b;
  }

  /** Time the leader needed to reach the runner's progress, subtracted from the runner's clock. */
  private gapTo(leader: State, st: State): number | null {
    const L = this.trackLength;
    const j = Math.floor((st.progress + L) / SAMPLE_M);
    const lo = leader.samples[j];
    if (j < 0 || lo === undefined) return null;
    const q0 = j * SAMPLE_M - L;
    const hi = leader.samples[j + 1];
    const q1 = hi !== undefined ? q0 + SAMPLE_M : leader.progress;
    const t1 = hi !== undefined ? hi : leader.lastT;
    const tl = q1 > q0 ? lo + ((st.progress - q0) / (q1 - q0)) * (t1 - lo) : lo;
    return Math.max(0, st.lastT - tl);
  }
}
