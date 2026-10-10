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
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import type { HudState } from '@/types/hud';
import { DEFAULT_SETTINGS, type DrivingLevel, type LapRecord, type RaceMode } from '@/types/session';
import { isPlausibleShootoutLap, isShootoutCar, MAX_SHOOTOUT_LAP_S, type ShootoutAttempt, type ShootoutOutcome } from '@/shootout/model';
import type { TyreCompound } from '@/physics/tyre-state';
import { restoreTelemetry, type LapTelemetry, type SessionTelemetry, type TelemetrySample } from '@/types/telemetry';


type Message = NonNullable<HudState['message']>;

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
  shootoutRemaining: number | null = null;

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
    if (attempt) this.shootoutRemaining = 3 - attempt.number;
    if (this.shootoutFault) this.timer.invalidate();
    this.say(this.mode === 'shootoutTop10' ? `SHOOTOUT LAP — ATTEMPT ${attempt?.number} OF 3` : 'SHOOTOUT LAP — ARCADE PRACTICE', 'good', 4);
  }

  invalidateShootout(reason: string): void {
    if (this.mode !== 'shootoutTop10') return;
    this.shootoutFault ??= reason;
    this.timer.invalidate();
  }

  abortShootout(reason: string): void {
    const run = this.shootoutRun;
    if (run?.phase !== 'timed') return;
    this.shootoutRun = { phase: 'finished', attempt: run.attempt, outcome: { kind: 'invalid', timeS: null, reason } };
  }

  /** Puts the car on pole position behind the standing-start line and arms the lights. */
  placeOnGrid(): void {
    if (this.shootoutRun?.phase === 'timed' || this.shootoutRun?.phase === 'finished') throw new Error('A started Shootout lap cannot be restarted. Start a new warm-up.');
    if (this.shootoutRun) { this.shootoutRun = { phase: 'warmup' }; this.shootoutFault = null; }
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
    this.ghostVisible = false;
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
      this.say('TRACK LIMITS — LAP INVALIDATED', 'warn');
    }
    // A lap counts for a level only when its rules held for the whole lap.
    if (levelRank(this.rulesLevel) < levelRank(this.level) && this.timer.valid && this.timer.lapNumber > 0) {
      this.timer.invalidate();
      this.say('RULES CHANGED — LAP INVALIDATED', 'warn');
    }
    const crossingsBefore = this.timer.crossings;
    const elapsed = this.timer.lapTime + dt;
    const res = this.timer.update(dt, this.lapDist());
    this.recorder.record(dt, { x: v.x, y: v.y, z: v.z, heading: v.heading, pitch: v.pitch, roll: v.roll, steer: v.steerAngle, speed: v.speed });
    const run = this.shootoutRun;
    if (run && (run.phase === 'warmup' || run.phase === 'timed') && (res?.timeS ?? elapsed) >= MAX_SHOOTOUT_LAP_S) {
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
      // A short reverse-and-recross restarts LapTimer but has not completed a warm-up.
      if (result) this.shootoutRun = { phase: 'ready' };
      this.recorder.reset();
      this.telemetryRecorder.reset();
      return;
    }
    if (run?.phase !== 'timed') return;
    if (this.mode === 'shootoutTop10' && result && !isPlausibleShootoutLap(result.timeS, result.sectorsS)) {
      this.shootoutFault ??= 'The lap time or sectors are outside the competition limits. This attempt is used.';
    }
    const outcome: ShootoutOutcome = result && result.valid && !result.standing && !this.shootoutFault
      ? { kind: 'valid', timeS: result.timeS, sectorsS: result.sectorsS }
      : { kind: 'invalid', timeS: result?.timeS ?? null, reason: this.shootoutFault ?? (result ? 'Track limits or a reset invalidated this lap.' : 'The full Shootout lap was not completed.') };
    this.shootoutRun = { phase: 'finished', attempt: run.attempt, outcome };
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
