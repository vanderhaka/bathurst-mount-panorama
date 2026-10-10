import { LEVEL_PRESETS } from '@/race/driving-levels';
import type { Settings } from '@/types/session';

/** Arcade practice and Top 10 use the same conditions for everyone: pro rules, but with ABS, traction control and
 * steering assist on. Phone and keyboard pedals are on/off, so without them every brake press locks the wheels
 * and the car spins. Steering sensitivity, pedal style (analog, auto-throttle) and other controls stay the player's own. */
export function competitionSettings(settings: Settings): Settings {
  return { ...settings, ...LEVEL_PRESETS.superstar, abs: true, tractionControl: true, steeringAssist: true, ghost: false };
}

/** Longest frame (s) of game time per rendered frame. A Shootout timed lap allows more, so a slow device keeps real
 * time (the race controller still steps physics at 1/60 s); elsewhere a long frame is slowed down, not skipped. */
export function frameDtCap(timedShootout: boolean): number {
  return timedShootout ? 0.1 : 1 / 20;
}

/** A Top 10 lap fails when real time ran more than 5 % plus 1 s ahead of game time: slow motion (a throttled
 * device or tab, a debugger) makes a lap easier to drive. */
export function slowMotionFault(simS: number, realS: number): string | null {
  return realS > simS * 1.05 + 1
    ? `The game ran in slow motion (${realS.toFixed(1)} s real time for a ${simS.toFixed(1)} s lap). This attempt is used.`
    : null;
}

/** Real time of the timed lap (ms clock, e.g. performance.now()), with paused time left out. */
export class RealLapClock {
  private startMs: number | null = null;
  private pausedMs = 0;
  private pausedAt: number | null = null;

  start(nowMs: number, paused = false): void {
    this.startMs = nowMs;
    this.pausedMs = 0;
    this.pausedAt = paused ? nowMs : null;
  }
  stop(): void { this.startMs = this.pausedAt = null; this.pausedMs = 0; }
  get running(): boolean { return this.startMs !== null; }
  pause(nowMs: number): void { if (this.startMs !== null && this.pausedAt === null) this.pausedAt = nowMs; }
  resume(nowMs: number): void {
    if (this.pausedAt === null) return;
    this.pausedMs += Math.max(0, nowMs - this.pausedAt);
    this.pausedAt = null;
  }
  /** Seconds driven so far; null when no timed lap runs. */
  elapsedS(nowMs: number): number | null {
    if (this.startMs === null) return null;
    const end = this.pausedAt ?? nowMs;
    return Math.max(0, end - this.startMs - this.pausedMs) / 1000;
  }
}
