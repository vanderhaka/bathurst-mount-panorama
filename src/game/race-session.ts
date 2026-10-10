import type { CarKind } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { GhostPlayer, GhostRecorder, type GhostPose } from '@/race/ghost';
import { formatLapTime } from '@/hud/format';
import { gridSlot } from '@/race/grid';
import { LapTimer, type LapResult } from '@/race/lap-timer';
import { loadRecords, type CarRecords } from '@/race/records';
import { flushRecords, queueRecordsSave } from '@/race/records-queue';
import { LEVEL_NAMES, lapLevel, levelRank, type Rules } from '@/race/driving-levels';
import { TelemetryRecorder } from '@/race/telemetry-recorder';
import { slowMotionFault } from '@/game/shootout-rules';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import type { HudState } from '@/types/hud';
import { DEFAULT_SETTINGS, type DrivingLevel, type LapRecord, type RaceMode } from '@/types/session';
import { isPlausibleShootoutLap, isShootoutCar, MAX_SHOOTOUT_LAP_S, type ShootoutAttempt, type ShootoutOutcome } from '@/shootout/model';
import type { WarmupStart } from '@/shootout/warmup-start';
import { TYRE_COMPOUNDS, type TyreCompound } from '@/physics/tyre-state';
import { restoreTelemetry, type LapTelemetry, type SessionTelemetry, type TelemetrySample } from '@/types/telemetry';


type Message = NonNullable<HudState['message']>;

/** Shootout warm-up: a rolling start on the racing line just before Forrest's Elbow (T18, apex region from 3951 m),
 * at about its apex speed (the AI profile is ~80 km/h there for all three cars), instead of a 2-minute standing-start
 * lap. About 2.4 km to the line: the Elbow, Conrod Straight, The Chase and Murray's Corner. */
export const WARMUP_START_S = 3930;
export const WARMUP_SPEED = 80 / 3.6;
/** Warm-up tyres start this far into their working window (soft 85 to 105 C), so the timed lap is never on cold tyres. */
export const WARMUP_TYRE_MARGIN_C = 5;
/** Share of the rolling warm-up's distance that must be driven forwards for its crossing to count. */
const WARMUP_MIN_COVERED = 0.9;

export type ShootoutRun =
  | { phase: 'warmup' }
  | { phase: 'ready' }
  | { phase: 'timed'; attempt: ShootoutAttempt | null }
  | { phase: 'finished'; attempt: ShootoutAttempt | null; outcome: ShootoutOutcome };

/** One time-trial session: start lights, timing, track limits, ghost and records for one car and driving level. */
export class RaceSession {
  readonly timer: LapTimer;
  records: CarRecords | null;
  ghost: GhostPlayer | null = null;
  private readonly recorder = new GhostRecorder();
  /** The level's saved lap history followed by the laps driven at that level (saved together). */
  readonly laps: LapRecord[] = [];
  /** Every lap driven in this session, at any level (Restart keeps them). */
  private readonly driven: LapRecord[] = [];
  /** The level whose records this session reads and writes. It follows the rules on the grid and at each lap start. */
  level: DrivingLevel;
  /** The level the current settings obey, and whether track limits apply (setRules, every frame). */
  private rulesLevel: DrivingLevel;
  private trackLimits: boolean;
  private readonly telemetryRecorder: TelemetryRecorder;
  private readonly telemetryLaps: LapTelemetry[] = [];
  private bestTelemetry: LapTelemetry | null = null;
  /** Start lights: number lit (0..5), -1 = lights out (racing). */
  lights = 0;
  private lightsT = 0;
  private holdT = 0;
  private offTrackT = 0;
  private message: Message | null = null;
  private messageT = 0;
  /** Shown when the current message ends (a refuel notice waits behind the lap time). */
  private nextMessage: { message: Message; seconds: number } | null = null;
  private refuelsSeen: number;
  readonly ghostPose: GhostPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, steer: 0, speed: 0 };
  ghostVisible = false;
  private shootoutRun: ShootoutRun | null;
  private shootoutFault: string | null = null;
  /** Why the timed lap became invalid on track (track limits, rules), shown on the result screen. */
  private lapFault: string | null = null;
  shootoutRemaining: number | null = null;
  /** Shootout only: where the warm-up starts (read by placeOnGrid). */
  warmupStart: WarmupStart = 'grid';
  /** Lap distance of the rolling warm-up start, until its first crossing. */
  private warmupFrom: number | null = null;
  /** The finished timed lap's ghost frames (the Top 10 replay, the Arcade best's ghost). */
  private timedFrames: Float32Array | null = null;
  /** Arcade practice: the timed lap's ghost (the current #1 replay, or the player's own Arcade best). */
  private practiceGhost: GhostPlayer | null = null;
  /** Whose lap the practice ghost is, for the start message (e.g. 'GHOST: CURRENT #1'). */
  private practiceGhostLabel = '';
  /** Real seconds of the timed lap so far (pauses excluded); the Top 10 lap fails when the game ran slow. */
  realLapTime: (() => number | null) | null = null;

  constructor(readonly car: CarKind, readonly track: Track, readonly line: RacingLine, readonly entity: CarEntity, readonly tyres: TyreCompound = 'soft',
    rules: Rules = DEFAULT_SETTINGS, readonly mode: RaceMode = 'timeTrial') {
    if (mode !== 'timeTrial' && (track.id !== 'bathurst' || !isShootoutCar(car))) throw new Error('Shootout requires Bathurst and a Camaro, Mustang or Supra.');
    this.shootoutRun = mode === 'timeTrial' ? null : { phase: 'warmup' };
    this.level = this.rulesLevel = lapLevel(rules);
    this.trackLimits = rules.trackLimits;
    this.records = mode === 'timeTrial' ? loadRecords(car, track.id, this.level) : null;
    this.telemetryRecorder = new TelemetryRecorder(track.length);
    this.bestTelemetry = restoreTelemetry(this.records?.telemetry, this.records?.bestS ?? Infinity, track.length);
    const sectorStarts = track.sectorStarts.map((s) => track.wrapS(s - track.startLineS));
    const saved = this.records && Number.isFinite(this.records.bestS) ? this.records : null;
    this.timer = new LapTimer(track.length, sectorStarts, saved ? { bestS: saved.bestS, bestSectors: saved.bestSectors, trace: saved.trace } : null);
    if (this.records?.ghost) this.ghost = new GhostPlayer(this.records.ghost);
    if (this.records?.laps) this.laps.push(...this.records.laps);
    this.refuelsSeen = entity.vehicle.stint.refuels;
  }

  /** Laps driven since this session started (Restart keeps them). */
  get sessionLaps(): LapRecord[] {
    return this.driven;
  }

  get shootout(): ShootoutRun | null { return this.shootoutRun; }

  get waitingForShootout(): boolean {
    return this.shootoutRun?.phase === 'ready' || this.shootoutRun?.phase === 'finished';
  }

  beginShootoutTimedLap(attempt: ShootoutAttempt | null): void {
    if (this.shootoutRun?.phase !== 'ready') throw new Error('Complete the warm-up before starting a Shootout lap.');
    if (this.mode === 'shootoutTop10' && (!attempt || attempt.car !== this.car)) throw new Error('A competition attempt must be saved before the timed lap starts.');
    this.shootoutRun = { phase: 'timed', attempt };
    this.lapFault = null;
    if (attempt) this.shootoutRemaining = 3 - attempt.number;
    if (this.shootoutFault) this.timer.invalidate();
    this.ghost = this.practiceGhost;
    this.ghostVisible = !!this.ghost;
    this.say(this.mode === 'shootoutTop10' ? `SHOOTOUT LAP — ATTEMPT ${attempt?.number} OF 3`
      : `SHOOTOUT LAP — ARCADE PRACTICE${this.practiceGhostLabel ? ` · ${this.practiceGhostLabel}` : ''}`, 'good', 4);
  }

  invalidateShootout(reason: string): void {
    if (this.mode !== 'shootoutTop10') return;
    this.shootoutFault ??= reason;
    this.timer.invalidate();
  }

  /** The timed lap's ghost frames once it finished (null before, or when it was abandoned). */
  get shootoutReplay(): Float32Array | null { return this.shootoutRun?.phase === 'finished' ? this.timedFrames : null; }

  /** Arcade practice: the ghost to race and the best lap that sets the live delta and sector colours. */
  setPracticeReference(ghost: Float32Array | null, best: { bestS: number; bestSectors: number[]; trace?: number[] } | null, label = ''): void {
    if (this.mode !== 'shootoutArcade') return;
    this.practiceGhost = ghost && ghost.length ? new GhostPlayer(ghost) : null;
    this.practiceGhostLabel = this.practiceGhost ? label : '';
    this.timer.useRecord(best);
    // A replay that arrives during the timed lap joins it at the current lap time.
    if (this.shootoutRun?.phase === 'timed') { this.ghost = this.practiceGhost; this.ghostVisible = !!this.ghost; }
  }

  abortShootout(reason: string): void {
    const run = this.shootoutRun;
    if (run?.phase !== 'timed') return;
    this.shootoutRun = { phase: 'finished', attempt: run.attempt, outcome: { kind: 'invalid', timeS: null, reason } };
  }

  /** Puts the car on pole position behind the standing-start line and arms the lights; a Shootout warm-up set to
   * 'rolling' starts before Forrest's Elbow instead. */
  placeOnGrid(): void {
    if (this.shootoutRun?.phase === 'timed' || this.shootoutRun?.phase === 'finished') throw new Error('A started Shootout lap cannot be restarted. Start a new warm-up.');
    if (this.shootoutRun) { this.shootoutRun = { phase: 'warmup' }; this.shootoutFault = null; this.timedFrames = null; if (this.warmupStart === 'rolling') return this.placeRolling(); }
    this.entity.vehicle.stint.reset({ compound: this.tyres });
    this.entity.vehicle.trackGrip.reset();
    const pole = gridSlot(this.track, 0);
    this.entity.reset(pole.s, pole.d);
    this.entity.repair();
    this.lights = 0;
    this.lightsT = 0;
    this.holdT = 1.2 + Math.random() * 1.8;
    this.timer.startOutLap(this.lapDist());
    this.recorder.reset();
    this.telemetryRecorder.reset();
    // The ghost replays a flying lap: like the delta, it returns at the first crossing.
    // The Shootout's practice ghost only shows in the timed lap.
    if (this.shootoutRun) { this.warmupFrom = null; this.ghost = null; }
    this.ghostVisible = false;
  }

  /** Shootout warm-up: rolling at WARMUP_SPEED on the racing line before Forrest's Elbow, warm tyres, no start lights. */
  private placeRolling(): void {
    const v = this.entity.vehicle, track = this.track;
    v.stint.reset({ compound: this.tyres, tempC: TYRE_COMPOUNDS[this.tyres].minC + WARMUP_TYRE_MARGIN_C });
    v.trackGrip.reset();
    const i = Math.round(track.wrapS(WARMUP_START_S) / track.spacing) % track.n;
    this.entity.reset(WARMUP_START_S, this.line.offset[i]);
    this.entity.repair();
    v.vx = Math.sin(v.heading) * WARMUP_SPEED;
    v.vz = Math.cos(v.heading) * WARMUP_SPEED;
    v.vy = WARMUP_SPEED * track.grade[i];
    // As the debug teleport: about the gear for this speed (automatic gears take over from there).
    v.pt.gear = Math.max(1, Math.min(v.spec.gearRatios.length, Math.round(WARMUP_SPEED / 14)));
    this.lights = -1;
    this.timer.startOutLap(this.lapDist());
    this.warmupFrom = this.lapDist();
    this.recorder.reset();
    this.telemetryRecorder.reset();
    this.ghost = null;
    this.ghostVisible = false;
    this.say('ROLLING WARM-UP — YOUR ATTEMPT STARTS AT THE LINE', 'good', 5);
  }

  lapDist(): number {
    return this.track.wrapS(this.entity.vehicle.tp.s - this.track.startLineS);
  }

  get racing(): boolean {
    return this.lights < 0;
  }

  /** The current settings, every frame. On the grid the session moves to the level they obey at once. */
  setRules(rules: Rules): void {
    this.rulesLevel = lapLevel(rules);
    this.trackLimits = rules.trackLimits;
    if (!this.racing && this.rulesLevel !== this.level) this.useLevel(this.rulesLevel);
  }

  /** Reads another level's records: best lap, sectors, delta trace, ghost, best telemetry and lap history. */
  private useLevel(level: DrivingLevel): void {
    if (this.shootoutRun) { this.level = level; return; }
    // A save still waiting for an idle moment must reach storage before that level is read again.
    flushRecords();
    this.level = level;
    this.records = loadRecords(this.car, this.track.id, level);
    const saved = this.records && Number.isFinite(this.records.bestS) ? this.records : null;
    this.timer.useRecord(saved ? { bestS: saved.bestS, bestSectors: saved.bestSectors, trace: saved.trace } : null);
    this.ghost = this.records?.ghost ? new GhostPlayer(this.records.ghost) : null;
    this.ghostVisible = false;
    this.bestTelemetry = restoreTelemetry(this.records?.telemetry, this.records?.bestS ?? Infinity, this.track.length);
    this.laps.length = 0;
    if (this.records?.laps) this.laps.push(...this.records.laps);
  }

  say(text: string, kind: Message['kind'], seconds = 2.6): void {
    this.message = { text, kind };
    this.messageT = seconds;
  }

  /** Says it now, or after the message on screen. */
  sayNext(text: string, kind: Message['kind'], seconds = 2.6): void {
    if (this.message) this.nextMessage = { message: { text, kind }, seconds };
    else this.say(text, kind, seconds);
  }

  currentMessage(): Message | null {
    return this.message;
  }

  /** Advances lights and messages; returns true once when the lights go out. */
  updateLights(dt: number): boolean {
    this.messageT -= dt;
    if (this.messageT <= 0) {
      this.message = null;
      const next = this.nextMessage;
      this.nextMessage = null;
      if (next) this.say(next.message.text, next.message.kind, next.seconds);
    }
    if (this.lights < 0) return false;
    this.lightsT += dt;
    if (this.lights < 5) {
      if (this.lightsT > 1) { this.lights++; this.lightsT = 0; }
      return false;
    }
    if (this.lightsT > this.holdT) {
      this.lights = -1;
      // The standing-start lap is timed from lights out.
      this.timer.startStandingLap();
      this.recorder.reset();
      this.say(this.shootoutRun ? 'WARM-UP LAP — YOUR ATTEMPT STARTS AT THE LINE' : 'LIGHTS OUT', 'good', this.shootoutRun ? 5 : 1.4);
      return true;
    }
    return false;
  }

  /** Per-frame race logic after physics. Returns a completed lap, if any. */
  update(dt: number): LapResult | null {
    if (!this.racing || this.waitingForShootout) return null;
    const v = this.entity.vehicle;
    const allOff = v.wheels.every((w) => w.surface !== 'road' && w.surface !== 'kerb');
    this.offTrackT = allOff ? this.offTrackT + dt : 0;
    if (this.trackLimits && this.offTrackT > 0.15 && this.timer.valid && this.timer.lapNumber > 0) {
      this.timer.invalidate();
      this.faultLap(`Track limits at ${this.track.placeAt(v.tp.s)}: all four wheels left the track.`);
      this.say(`TRACK LIMITS — LAP INVALIDATED${this.shootoutConsequence()}`, 'warn', this.shootoutRun ? 4 : undefined);
    }
    // A lap counts for a level only when its rules held for the whole lap.
    if (levelRank(this.rulesLevel) < levelRank(this.level) && this.timer.valid && this.timer.lapNumber > 0) {
      this.timer.invalidate();
      this.faultLap('The rules or assists changed during the lap.');
      this.say(`RULES CHANGED — LAP INVALIDATED${this.shootoutConsequence()}`, 'warn', this.shootoutRun ? 4 : undefined);
    }
    const crossingsBefore = this.timer.crossings;
    const elapsed = this.timer.lapTime + dt;
    const res = this.timer.update(dt, this.lapDist());
    this.recorder.record(dt, { x: v.x, y: v.y, z: v.z, heading: v.heading, pitch: v.pitch, roll: v.roll, steer: v.steerAngle, speed: v.speed });
    const run = this.shootoutRun;
    // A rolling warm-up's crossing has no lap result: it ends at the crossing, not at the end of this frame.
    const rolledIn = run?.phase === 'warmup' && this.timer.crossings !== crossingsBefore && this.rolledToLine();
    const lapEnd = res?.timeS ?? (rolledIn ? elapsed - this.timer.lapTime : elapsed);
    if (run && (run.phase === 'warmup' || run.phase === 'timed') && lapEnd >= MAX_SHOOTOUT_LAP_S) {
      let reason = '10-minute lap limit reached. No score recorded.';
      if (run.phase === 'warmup') reason += ' No competition attempt used.';
      else if (this.mode === 'shootoutTop10') reason += ' This attempt is used.';
      if (this.mode === 'shootoutArcade') reason += ' Arcade practice remains unlimited.';
      this.shootoutRun = { phase: 'finished', attempt: run.phase === 'timed' ? run.attempt : null, outcome: { kind: 'invalid', timeS: null, reason } };
      this.timer.lapTime = MAX_SHOOTOUT_LAP_S;
      this.timer.invalidate();
      this.say(reason, 'warn', 5);
    } else if (this.timer.crossings !== crossingsBefore) {
      if (this.shootoutRun) this.onShootoutCrossing(res);
      else this.onLapStart(res);
    }
    else this.telemetryRecorder.record(this.telemetrySample());
    // The stint refuels at the line when the tank cannot finish the next lap.
    if (v.stint.refuels !== this.refuelsSeen) {
      this.refuelsSeen = v.stint.refuels;
      this.sayNext('REFUELLED', 'info');
    }
    if (this.ghost && this.ghostVisible) {
      this.ghostVisible = this.ghost.poseAt(this.timer.lapTime, this.ghostPose);
    }
    return res;
  }

  private onShootoutCrossing(result: LapResult | null): void {
    const run = this.shootoutRun;
    if (run?.phase === 'warmup') {
      // The rolling warm-up reaches the line on its out lap: it counts when the car drove there, not when it
      // reversed over the line and back (then a full lap is needed, as before).
      const rolled = this.rolledToLine();
      this.warmupFrom = null;
      if (result || rolled) this.shootoutRun = { phase: 'ready' };
      this.recorder.reset();
      this.telemetryRecorder.reset();
      return;
    }
    if (run?.phase !== 'timed') return;
    if (this.mode === 'shootoutTop10' && result && !isPlausibleShootoutLap(result.timeS, result.sectorsS)) {
      this.shootoutFault ??= 'The lap time or sectors are outside the competition limits. This attempt is used.';
    }
    // Checked at the line: real time against the lap's game time (a throttled device must not drive in slow motion).
    const realS = this.realLapTime?.() ?? null;
    const slow = result && realS !== null ? slowMotionFault(result.timeS, realS) : null;
    if (slow) this.invalidateShootout(slow);
    this.timedFrames = this.recorder.take();
    const outcome: ShootoutOutcome = result && result.valid && !result.standing && !this.shootoutFault
      ? { kind: 'valid', timeS: result.timeS, sectorsS: result.sectorsS }
      : { kind: 'invalid', timeS: result?.timeS ?? null, reason: this.shootoutFault ?? this.lapFault ?? (result ? 'Track limits or a reset invalidated this lap.' : 'The full Shootout lap was not completed.') };
    this.shootoutRun = { phase: 'finished', attempt: run.attempt, outcome };
  }

  /** Keeps the first on-track reason the timed Shootout lap became invalid. */
  private faultLap(reason: string): void {
    if (this.shootoutRun?.phase === 'timed') this.lapFault ??= reason;
  }

  /** Added to an invalidation banner during a timed Shootout lap: what the invalid lap costs. */
  private shootoutConsequence(): string {
    if (this.shootoutRun?.phase !== 'timed') return '';
    return this.mode === 'shootoutTop10' ? ' · NO LEADERBOARD SCORE' : ' · NO ARCADE BEST';
  }

  /** The crossing just made ends the rolling warm-up: the car drove (most of) the way from its start to the line. */
  private rolledToLine(): boolean {
    return this.warmupFrom !== null && this.timer.lineCovered >= (this.track.length - this.warmupFrom) * WARMUP_MIN_COVERED;
  }

  /** Called at every forward crossing; `res` is null when the crossing only restarted the lap. */
  private onLapStart(res: LapResult | null): void {
    const frames = this.recorder.take();
    const lapTelemetry = this.telemetryRecorder.cross(res, this.timer.lapNumber, this.telemetrySample());
    if (lapTelemetry) {
      this.telemetryLaps.push(lapTelemetry);
      if (this.telemetryLaps.length > 12) this.telemetryLaps.shift();
    }
    if (res) {
      // The standing-start lap is shorter than a flying lap: kept in the history, never valid.
      const rec: LapRecord = { car: this.car, timeS: res.timeS, sectorsS: res.sectorsS, valid: res.valid && !res.standing, dateIso: new Date().toISOString(), level: this.level };
      if (res.standing) rec.standing = true;
      this.laps.push(rec);
      this.driven.push(rec);
      const prevBest = this.records?.bestS ?? null;
      const isBest = res.valid && (prevBest === null || res.timeS < prevBest) && this.timer.bestS === res.timeS;
      if (isBest) {
        this.ghost = new GhostPlayer(frames);
        this.bestTelemetry = lapTelemetry;
        this.say(`NEW BEST LAP  ${fmt(res.timeS)}`, 'best', 4);
      } else if (res.standing) this.say(`STANDING-START LAP ${fmt(res.timeS)}`, 'info', 3);
      else if (!res.valid) this.say(`LAP ${fmt(res.timeS)} — INVALID`, 'warn', 3);
      else this.say(`LAP ${fmt(res.timeS)}`, 'info', 3);
      this.persist(isBest ? frames : undefined);
    }
    // The next lap counts for the level the rules obey now.
    if (this.rulesLevel !== this.level) {
      this.useLevel(this.rulesLevel);
      this.sayNext(`LAPS NOW COUNT AS ${LEVEL_NAMES[this.level].badge.toUpperCase()}`, 'info');
    }
    this.ghostVisible = !!this.ghost;
  }

  private persist(ghostFrames?: Float32Array): void {
    const save = this.timer.saveData();
    const base: CarRecords = this.records ?? { bestS: Infinity, bestSectors: [], laps: [] };
    const next: CarRecords = {
      bestS: save?.bestS ?? base.bestS,
      bestSectors: save?.bestSectors ?? base.bestSectors,
      trace: save?.trace ?? base.trace,
      ghost: ghostFrames ?? base.ghost,
      telemetry: this.bestTelemetry ?? undefined,
      laps: this.laps.slice(-50),
    };
    // Saved when the browser is idle, or at once on quit and page hide (records-queue).
    if (Number.isFinite(next.bestS) || next.laps.length) queueRecordsSave(this.car, next, this.track.id, this.level);
    this.records = next;
  }

  private telemetrySample(): TelemetrySample {
    const t = this.entity.vehicle.telemetry;
    return { distanceM: this.lapDist(), timeS: this.timer.lapTime, speedKmh: Math.abs(t.speed) * 3.6, throttle: t.throttle, brake: t.brake };
  }

  telemetrySnapshot(): SessionTelemetry {
    return { laps: this.telemetryLaps.slice(), best: this.bestTelemetry, untracedBest: this.timer.bestS !== null && !this.bestTelemetry,
      corners: this.track.corners.map((c) => ({ distanceM: this.track.wrapS(c.s - this.track.startLineS), turn: c.turn, name: c.name })) };
  }

  /**
   * Puts the car back on the racing line at the current position and repairs it. The lap becomes
   * invalid when track limits apply (with them off, only Casual records take the lap).
   * `auto`: automatic recovery after the car was stuck.
   */
  resetToTrack(reason: 'manual' | 'auto' = 'manual'): void {
    if (this.shootoutRun) {
      if (this.shootoutRun.phase === 'warmup') { this.placeOnGrid(); this.say('WARM-UP RESTARTED — NO ATTEMPT USED', 'info', 4); }
      else this.abortShootout('The car was reset during the timed lap. This attempt is used.');
      return;
    }
    const v = this.entity.vehicle;
    const s = v.tp.s;
    const i = Math.round(this.track.wrapS(s) / this.track.spacing) % this.track.n;
    this.entity.reset(s, this.line.offset[i]);
    this.entity.repair();
    const invalid = this.trackLimits && this.timer.lapNumber > 0;
    if (invalid) this.timer.invalidate();
    const what = reason === 'auto' ? 'BACK ON TRACK' : 'CAR RESET AND REPAIRED';
    this.say(invalid ? `${what} — LAP INVALIDATED` : what, reason === 'auto' && !invalid ? 'info' : 'warn');
  }
}

/** Lap time as m:ss.mmm, truncated like the timing tower (one format everywhere). */
export function fmt(t: number): string {
  return formatLapTime(t);
}
