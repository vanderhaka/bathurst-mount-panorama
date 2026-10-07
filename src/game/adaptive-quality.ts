import type { QualityChoice } from '@/game/quality-store';
import type { Settings } from '@/types/session';

const FPS_BUDGET = { high: 60, medium: 50, low: 30 } as const;
const WINDOW_SECONDS = 2;
const OBSERVE_SECONDS = 10;

/** Uses observed render intervals, before the game clamps its physics delta. */
export class AdaptiveQuality {
  private choice: QualityChoice;
  private elapsed = OBSERVE_SECONDS;
  private seconds = 0;
  private frames = 0;

  constructor(choice: QualityChoice) { this.choice = { ...choice }; }

  startRace(): void {
    this.elapsed = 0;
    this.seconds = 0;
    this.frames = 0;
  }

  setChoice(choice: QualityChoice): void {
    this.choice = { ...choice };
    this.seconds = 0;
    this.frames = 0;
  }

  sample(rawSeconds: number, cap: Settings['frameRate']): QualityChoice | null {
    if (!Number.isFinite(rawSeconds) || rawSeconds <= 0 || this.elapsed >= OBSERVE_SECONDS - 1e-6) return null;
    const seconds = Math.min(rawSeconds, OBSERVE_SECONDS - this.elapsed);
    this.elapsed += seconds;
    if (!this.choice.automatic) return null;
    this.seconds += seconds;
    this.frames += seconds / rawSeconds;
    if (this.seconds < WINDOW_SECONDS - 1e-6) return null;
    const observed = this.seconds / this.frames;
    const budget = 1 / Math.min(FPS_BUDGET[this.choice.quality], cap || Infinity);
    this.seconds = 0;
    this.frames = 0;
    // Three percent allows timer jitter without treating a deliberate FPS cap as overload.
    if (observed <= budget * 1.03) return null;
    const q = this.choice.quality;
    const quality = q === 'high' ? 'medium' : 'low';
    const pixelRatio = q === 'high' ? Math.min(this.choice.pixelRatio, 1.5)
      : q === 'medium' ? Math.min(this.choice.pixelRatio, 1)
      : Math.max(0.5, this.choice.pixelRatio - 0.25);
    if (quality === q && pixelRatio === this.choice.pixelRatio) return null;
    this.choice = { quality, pixelRatio, automatic: true };
    return { ...this.choice };
  }
}
