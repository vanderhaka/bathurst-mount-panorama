/** A realtime context has an output to pause; an OfflineAudioContext (tests, harness renders) has none. */
export function isRealtime(ctx: BaseAudioContext | null): ctx is AudioContext {
  return typeof AudioContext !== 'undefined' && ctx instanceof AudioContext;
}

/**
 * The game's pause intent for an AudioContext. It acts on every state but 'closed': iOS also reports
 * the non-standard 'interrupted' state when the system takes the audio session (backgrounding, a call),
 * possibly before the page reports it is hidden, and a context the page never suspended may come back
 * by itself. The intent is remembered, so anything that restarts the context before resume() is undone.
 */
export class ContextPause {
  private paused = false;
  private watched: AudioContext | null = null;

  suspend(ctx: BaseAudioContext | null): void {
    this.paused = true;
    if (!isRealtime(ctx) || ctx.state === 'closed') return;
    this.watched = ctx;
    ctx.addEventListener('statechange', this.onStateChange);
    ctx.suspend().catch(() => undefined);
  }

  /** Always asks, whatever state is reported: a suspend still queued makes that state stale. */
  resume(ctx: BaseAudioContext | null): void {
    this.paused = false;
    if (isRealtime(ctx) && ctx.state !== 'closed') ctx.resume().catch(() => undefined);
  }

  /** Stops watching the context (the engine is being disposed). */
  release(): void {
    this.watched?.removeEventListener('statechange', this.onStateChange);
    this.watched = null;
  }

  private readonly onStateChange = (): void => {
    const ctx = this.watched;
    if (this.paused && ctx?.state === 'running') ctx.suspend().catch(() => undefined);
  };
}
