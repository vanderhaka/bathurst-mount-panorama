import type { QualityChoice } from '@/game/quality-store';
import type { Settings } from '@/types/session';

const FPS_BUDGET = { high: 60, medium: 50, low: 30 } as const;
/** A deficit this large steps the tier even while dynamic resolution still has room: pixels alone will not cover it. */
const LARGE_DEFICIT = 1.5;
/** Seconds of steady frames averaged into one verdict. */
const WINDOW_SECONDS = 2;
/** One step down needs this many over-budget windows in a row. */
const STRIKES = 2;
/** Ignored after a race starts, restarts or resumes and after a quality change lands. */
const WARM_UP_SECONDS = 1;
/** A longer interval is a hitch (model build, shader compile, a world rebuild), not frame-rate evidence. */
const HITCH_SECONDS = 0.25;
/** Only an unbroken run of hitches this long counts as an over-budget window (a device under 4 fps). */
const HITCH_RUN = 4;
/** Steady-frame evidence per race, so a slow scene later in the race never triggers a rebuild. */
const OBSERVE_SECONDS = 10;
const EPSILON = 1e-6;

/** Seconds per frame that a tier aims for, honouring the player's frame-rate cap. */
export function frameBudget(quality: QualityChoice['quality'], cap: Settings['frameRate']): number {
  return 1 / Math.min(FPS_BUDGET[quality], cap || Infinity);
}

/** Uses observed render intervals, before the game clamps its physics delta. */
export class AdaptiveQuality {
  private choice: QualityChoice;
  private observed = OBSERVE_SECONDS;
  private warmUp = 0;
  private seconds = 0;
  private frames = 0;
  private strikes = 0;
  private hitches = 0;

  constructor(choice: QualityChoice) { this.choice = { ...choice }; }

  startRace(): void {
    this.observed = 0;
    this.settle();
  }

  /** Ignores the next second of frames and starts a fresh verdict. */
  settle(): void {
    this.warmUp = WARM_UP_SECONDS;
    this.seconds = 0;
    this.frames = 0;
    this.strikes = 0;
    this.hitches = 0;
  }

  setChoice(choice: QualityChoice): void {
    this.choice = { ...choice };
    this.settle();
  }

  /** `resolutionExhausted` is false while dynamic resolution can still absorb a small deficit (DynamicResolution). */
  sample(rawSeconds: number, cap: Settings['frameRate'], resolutionExhausted = true): QualityChoice | null {
    if (!Number.isFinite(rawSeconds) || rawSeconds <= 0 || !this.choice.automatic) return null;
    if (this.observed >= OBSERVE_SECONDS - EPSILON) return null;
    if (this.warmUp > EPSILON) {
      this.warmUp -= Math.min(rawSeconds, HITCH_SECONDS);
      return null;
    }
    if (rawSeconds > HITCH_SECONDS) {
      if (++this.hitches < HITCH_RUN) return null;
      this.hitches = 0;
      return this.verdict(true);
    }
    this.hitches = 0;
    const seconds = Math.min(rawSeconds, OBSERVE_SECONDS - this.observed);
    this.observed += seconds;
    this.seconds += seconds;
    this.frames += seconds / rawSeconds;
    if (this.seconds < WINDOW_SECONDS - EPSILON) return null;
    const observed = this.seconds / this.frames;
    const budget = frameBudget(this.choice.quality, cap);
    this.seconds = 0;
    this.frames = 0;
    // Three percent allows timer jitter without treating a deliberate FPS cap as overload.
    return this.verdict(observed > budget * 1.03 && (resolutionExhausted || observed > budget * LARGE_DEFICIT));
  }

  private verdict(overBudget: boolean): QualityChoice | null {
    if (!overBudget) { this.strikes = 0; return null; }
    if (++this.strikes < STRIKES) return null;
    const q = this.choice.quality;
    const quality = q === 'high' ? 'medium' : 'low';
    const pixelRatio = q === 'high' ? Math.min(this.choice.pixelRatio, 1.5)
      : q === 'medium' ? Math.min(this.choice.pixelRatio, 1)
      : Math.max(0.5, this.choice.pixelRatio - 0.25);
    this.settle();
    if (quality === q && pixelRatio === this.choice.pixelRatio) return null;
    this.choice = { quality, pixelRatio, automatic: true };
    return { ...this.choice };
  }
}
