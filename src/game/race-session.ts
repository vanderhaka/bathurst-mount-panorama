import type { CarKind } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { GhostPlayer, GhostRecorder, type GhostPose } from '@/race/ghost';
import { formatLapTime } from '@/hud/format';
import { LapTimer, type LapResult } from '@/race/lap-timer';
import { loadRecords, saveRecords, type CarRecords } from '@/race/records';
import { SECTOR_STARTS_S } from '@/track/layout';
import type { RacingLine } from '@/track/racing-line';
import type { Track } from '@/track/track-model';
import type { HudState } from '@/types/hud';
import type { LapRecord } from '@/types/session';


type Message = NonNullable<HudState['message']>;

/** One time-trial session: start lights, timing, track limits, ghost and records for one car. */
export class RaceSession {
  readonly timer: LapTimer;
  readonly records: CarRecords | null;
  ghost: GhostPlayer | null = null;
  private readonly recorder = new GhostRecorder();
  readonly laps: LapRecord[] = [];
  /** Start lights: number lit (0..5), -1 = lights out (racing). */
  lights = 0;
  private lightsT = 0;
  private holdT = 0;
  private offTrackT = 0;
  private message: Message | null = null;
  private messageT = 0;
  readonly ghostPose: GhostPose = { x: 0, y: 0, z: 0, heading: 0, pitch: 0, roll: 0, steer: 0, speed: 0 };
  ghostVisible = false;

  constructor(readonly car: CarKind, readonly track: Track, readonly line: RacingLine, readonly entity: CarEntity) {
    this.records = loadRecords(car);
    const sectorStarts = SECTOR_STARTS_S.map((s) => track.wrapS(s - track.startLineS));
    const saved = this.records && Number.isFinite(this.records.bestS) ? this.records : null;
    this.timer = new LapTimer(track.length, sectorStarts, saved ? { bestS: saved.bestS, bestSectors: saved.bestSectors, trace: saved.trace } : null);
    if (this.records?.ghost) this.ghost = new GhostPlayer(this.records.ghost);
    if (this.records?.laps) this.laps.push(...this.records.laps);
  }

  /** Puts the car on pole position behind the standing-start line and arms the lights. */
  placeOnGrid(): void {
    const s = this.track.gridLineS - 7;
    const i = Math.round(s / this.track.spacing);
    this.entity.reset(s, Math.max(-this.track.right.edge[i] + 2, Math.min(this.track.left.edge[i] - 2, -2.2)));
    this.entity.repair();
    this.lights = 0;
    this.lightsT = 0;
    this.holdT = 1.2 + Math.random() * 1.8;
    this.timer.startOutLap(this.lapDist());
    this.recorder.reset();
  }

  lapDist(): number {
    return this.track.wrapS(this.entity.vehicle.tp.s - this.track.startLineS);
  }

  get racing(): boolean {
    return this.lights < 0;
  }

  say(text: string, kind: Message['kind'], seconds = 2.6): void {
    this.message = { text, kind };
    this.messageT = seconds;
  }

  currentMessage(): Message | null {
    return this.message;
  }

  /** Advances lights and messages; returns true once when the lights go out. */
  updateLights(dt: number): boolean {
    this.messageT -= dt;
    if (this.messageT <= 0) this.message = null;
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
      this.say('LIGHTS OUT', 'good', 1.4);
      return true;
    }
    return false;
  }

  /** Per-frame race logic after physics. Returns a completed lap, if any. */
  update(dt: number): LapResult | null {
    if (!this.racing) return null;
    const v = this.entity.vehicle;
    const allOff = v.wheels.every((w) => w.surface !== 'road' && w.surface !== 'kerb');
    this.offTrackT = allOff ? this.offTrackT + dt : 0;
    if (this.offTrackT > 0.15 && this.timer.valid && this.timer.lapNumber > 0) {
      this.timer.invalidate();
      this.say('TRACK LIMITS — LAP INVALIDATED', 'warn');
    }
    const crossingsBefore = this.timer.crossings;
    const res = this.timer.update(dt, this.lapDist());
    this.recorder.record(dt, { x: v.x, y: v.y, z: v.z, heading: v.heading, pitch: v.pitch, roll: v.roll, steer: v.steerAngle, speed: v.speed });
    if (this.timer.crossings !== crossingsBefore) this.onLapStart(res);
    if (this.ghost && this.ghostVisible) {
      this.ghostVisible = this.ghost.poseAt(this.timer.lapTime, this.ghostPose);
    }
    return res;
  }

  /** Called at every forward crossing; `res` is null when the crossing only restarted the lap. */
  private onLapStart(res: LapResult | null): void {
    const frames = this.recorder.take();
    if (res) {
      // The standing-start lap is shorter than a flying lap: kept in the history, never valid.
      const rec: LapRecord = { car: this.car, timeS: res.timeS, sectorsS: res.sectorsS, valid: res.valid && !res.standing, dateIso: new Date().toISOString() };
      this.laps.push(rec);
      const prevBest = this.records?.bestS ?? null;
      const isBest = res.valid && (prevBest === null || res.timeS < prevBest) && this.timer.bestS === res.timeS;
      if (isBest) {
        this.ghost = new GhostPlayer(frames);
        this.say(`NEW BEST LAP  ${fmt(res.timeS)}`, 'best', 4);
      } else if (res.standing) this.say(`STANDING-START LAP ${fmt(res.timeS)}`, 'info', 3);
      else if (!res.valid) this.say(`LAP ${fmt(res.timeS)} — INVALID`, 'warn', 3);
      else this.say(`LAP ${fmt(res.timeS)}`, 'info', 3);
      this.persist(isBest ? frames : undefined);
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
      laps: this.laps.slice(-50),
    };
    // Save when the browser is idle: a synchronous localStorage write at the line costs a frame.
    if (Number.isFinite(next.bestS) || next.laps.length) whenIdle(() => saveRecords(this.car, next));
    if (this.records) Object.assign(this.records, next);
  }

  /** Puts the car back on the racing line at the current position and repairs it (lap becomes invalid). */
  resetToTrack(): void {
    const v = this.entity.vehicle;
    const s = v.tp.s;
    const i = Math.round(this.track.wrapS(s) / this.track.spacing) % this.track.n;
    this.entity.reset(s, this.line.offset[i]);
    this.entity.repair();
    const timed = this.timer.lapNumber > 0;
    if (timed) this.timer.invalidate();
    this.say(timed ? 'CAR RESET AND REPAIRED — LAP INVALIDATED' : 'CAR RESET AND REPAIRED', 'warn');
  }
}

function whenIdle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 0);
}

/** Lap time as m:ss.mmm, truncated like the timing tower (one format everywhere). */
export function fmt(t: number): string {
  return formatLapTime(t);
}
