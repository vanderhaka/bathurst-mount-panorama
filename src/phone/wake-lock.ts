interface ScreenLock {
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void, options?: { once: boolean }): void;
}
interface WakeApi { request(type: 'screen'): Promise<ScreenLock> }

/** Keep only visible, running races awake. A denied lock never interrupts play. */
export class RaceWakeLock {
  private running = false;
  private pending = false;
  private generation = 0;
  private lock: ScreenLock | null = null;
  private readonly onVisibility = () => this.visibilityChanged();

  constructor(
    private readonly api: WakeApi | undefined = typeof navigator === 'undefined' ? undefined : navigator.wakeLock,
    private readonly visible: () => boolean = () => !document.hidden,
  ) {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  setRunning(running: boolean): void {
    if (running === this.running) return;
    this.running = running;
    this.generation++;
    void this.reconcile();
  }

  visibilityChanged(): void {
    this.generation++;
    void this.reconcile();
  }

  private async reconcile(): Promise<void> {
    if (!this.running || !this.visible()) {
      const previous = this.lock;
      this.lock = null;
      if (previous) void previous.release().catch(() => {});
      return;
    }
    if (!this.api || this.lock || this.pending) return;
    this.pending = true;
    const generation = this.generation;
    try {
      const next = await this.api.request('screen');
      if (generation !== this.generation || !this.running || !this.visible()) {
        await next.release();
      } else {
        this.lock = next;
        next.addEventListener('release', () => { if (this.lock === next) this.lock = null; }, { once: true });
      }
    } catch {
      // Low battery, browser policy or an unavailable API: retry on the next
      // race/visibility transition, rather than repeatedly prompting or polling.
    } finally {
      this.pending = false;
      if (generation !== this.generation && this.running && this.visible()) void this.reconcile();
    }
  }

  dispose(): void {
    this.setRunning(false);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
