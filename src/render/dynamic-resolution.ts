// Dynamic resolution: a render scale for the post chain's scene target (the final grade still draws at full
// canvas size). Small, continuous frame-time deficits are absorbed here; AdaptiveQuality steps whole tiers only
// when this scale is exhausted or the deficit is large. Fast hardware stays at 1, so the look is unchanged there.

/** Discrete scales (81 %, 64 %, 49 % of the pixels): each change reallocates the targets, so it must be rare. */
export const RENDER_SCALES = [1, 0.9, 0.8, 0.7] as const;
/** Frames are averaged over this long before any verdict. */
const WINDOW_SECONDS = 0.5;
/** After a change, the new size needs time to show in the frame times (and GPU queries lag a few frames). */
const COOLDOWN_SECONDS = 1;
/** A longer interval is a hitch (shader compile, GC, tab switch), not fill-rate evidence. */
const HITCH_SECONDS = 0.25;
/**
 * GPU-timed: frames that miss the budget with the GPU busy for more than `GPU_TARGET` of it are fill-bound and step
 * down, sized to bring the GPU back to the target; a step up needs the GPU under `GPU_LOW` and a prediction that
 * the larger size stays under the target. Timer queries alone never lower the scale (some drivers include idle gaps).
 */
const GPU_TARGET = 0.8, GPU_LOW = 0.6;
/** Frames this much over budget are misses; at most `ON_BUDGET` over counts as on budget (timer jitter). */
const OVER = 1.08, ON_BUDGET = 1.02;
/** Interval-only: on-budget time before probing one step up; doubles after each probe that misses (to `MAX_PROBE`). */
const PROBE_SECONDS = 4, MAX_PROBE_SECONDS = 64;
/** Interval-only: a step up that misses the budget this soon afterwards was a failed probe. */
const PROBE_TRIAL_SECONDS = 2;
/** Sustained GPU headroom before stepping up (GPU-timed). */
const UP_HOLD_SECONDS = 2;

export class DynamicResolution {
  private level = 0;
  private seconds = 0;
  private frames = 0;
  private gpuSum = 0;
  private gpuCount = 0;
  private cooldown = 0;
  private headroom = 0;
  private probeDelay = PROBE_SECONDS;
  private sinceUp = Infinity;
  private over = false;
  private cpuBound = false;

  /** Current scale (1 = the tier's full pixel density). */
  get scale(): number { return RENDER_SCALES[this.level]; }

  /**
   * Fewer pixels cannot absorb the current deficit: at the lowest scale and still over budget, or missing frames
   * while the GPU is not the limit. Only then may the tier stepper act on a small deficit.
   */
  get exhausted(): boolean { return (this.level === RENDER_SCALES.length - 1 && this.over) || this.cpuBound; }

  /** Back to full resolution (a new tier, or leaving the race); returns true when the scale changed. */
  reset(): boolean {
    const changed = this.level !== 0;
    this.level = 0;
    this.probeDelay = PROBE_SECONDS;
    this.over = this.cpuBound = false;
    this.hold();
    return changed;
  }

  /** Discards the current window and waits a cooldown (after a pause, a hitch or a rebuild). */
  hold(): void {
    this.seconds = this.frames = this.gpuSum = this.gpuCount = this.headroom = 0;
    this.cooldown = COOLDOWN_SECONDS;
  }

  /**
   * One rendered frame: its wall-clock interval, the GPU time of a recent frame when the browser exposes timer
   * queries (else null), and the frame budget. Returns the new scale when it changes.
   */
  sample(intervalSeconds: number, gpuSeconds: number | null, budgetSeconds: number): number | null {
    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0 || !(budgetSeconds > 0)) return null;
    if (intervalSeconds > HITCH_SECONDS) { this.hold(); return null; }
    this.sinceUp += intervalSeconds;
    if (this.cooldown > 0) { this.cooldown -= intervalSeconds; return null; }
    this.seconds += intervalSeconds;
    this.frames++;
    if (gpuSeconds !== null && Number.isFinite(gpuSeconds) && gpuSeconds > 0) { this.gpuSum += gpuSeconds; this.gpuCount++; }
    if (this.seconds < WINDOW_SECONDS) return null;
    const interval = this.seconds / this.frames;
    const window = this.seconds;
    const gpu = this.gpuCount >= 3 ? this.gpuSum / this.gpuCount : null;
    this.seconds = this.frames = this.gpuSum = this.gpuCount = 0;
    return gpu === null ? this.byInterval(interval, budgetSeconds, window) : this.byGpu(gpu, interval, budgetSeconds, window);
  }

  /** The GPU time says how much of the budget the pixels use, so the step can be sized and headroom is visible. */
  private byGpu(gpu: number, interval: number, budget: number, window: number): number | null {
    const load = gpu / budget, missing = interval > budget * OVER;
    this.over = missing && load > GPU_TARGET;
    // A missed frame with a light GPU load is CPU time: fewer pixels would not help.
    this.cpuBound = missing && !this.over;
    if (this.over) {
      this.headroom = 0;
      // GPU time scales roughly with pixel count (scale squared).
      const wanted = this.scale * Math.sqrt(GPU_TARGET / load);
      let next = this.level + 1;
      while (next < RENDER_SCALES.length - 1 && RENDER_SCALES[next] > wanted) next++;
      return this.setLevel(Math.min(next, RENDER_SCALES.length - 1));
    }
    // Up only when the larger size is predicted to stay at the target, so the step cannot oscillate.
    const up = this.level - 1;
    if (up < 0 || missing || load > GPU_LOW || load * (RENDER_SCALES[up] / this.scale) ** 2 > GPU_TARGET) {
      this.headroom = 0;
      return null;
    }
    this.headroom += window;
    if (this.headroom < UP_HOLD_SECONDS) return null;
    return this.setLevel(up);
  }

  /** Without GPU timing, only missed frames are visible: step down on misses and probe upwards with backoff. */
  private byInterval(interval: number, budget: number, window: number): number | null {
    this.over = interval > budget * OVER;
    this.cpuBound = false;
    if (this.over) {
      this.headroom = 0;
      // A miss right after a step up: that step was too far, wait longer before the next probe.
      if (this.sinceUp < PROBE_TRIAL_SECONDS + COOLDOWN_SECONDS) this.probeDelay = Math.min(MAX_PROBE_SECONDS, this.probeDelay * 2);
      return this.setLevel(Math.min(this.level + 1, RENDER_SCALES.length - 1));
    }
    if (interval > budget * ON_BUDGET || this.level === 0) { this.headroom = 0; return null; }
    this.headroom += window;
    if (this.headroom < this.probeDelay) return null;
    this.sinceUp = 0;
    return this.setLevel(this.level - 1);
  }

  private setLevel(level: number): number | null {
    if (level === this.level) return null;
    this.level = level;
    this.hold();
    return this.scale;
  }
}
