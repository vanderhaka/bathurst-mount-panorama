import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCarAudioDebug } from '@/audio/car-audio';

type State = 'suspended' | 'running' | 'closed' | 'interrupted';

/**
 * A realtime AudioContext with the iOS 'interrupted' state. Calls take effect when the platform
 * processes them (`flush`), in order, like the real control queue; `deferred = false` applies them at once.
 */
class FakeAudioContext {
  state: State = 'running';
  deferred = false;
  readonly calls: string[] = [];
  private readonly queue: Array<() => void> = [];
  private readonly listeners = new Set<() => void>();
  addEventListener(type: string, listener: () => void): void { if (type === 'statechange') this.listeners.add(listener); }
  removeEventListener(type: string, listener: () => void): void { if (type === 'statechange') this.listeners.delete(listener); }
  get listenerCount(): number { return this.listeners.size; }
  suspend(): Promise<void> { return this.request('suspend', 'suspended'); }
  resume(): Promise<void> { return this.request('resume', 'running'); }
  close(): Promise<void> { return this.request('close', 'closed'); }
  /** The platform changes the state by itself (backgrounding, a call, coming back to the page). */
  platform(state: State): void { this.set(state); }
  flush(): void { while (this.queue.length) this.queue.shift()?.(); }
  private request(name: string, state: State): Promise<void> {
    this.calls.push(name);
    if (this.state === 'closed') return Promise.reject(new Error('InvalidStateError'));
    const apply = () => this.set(state);
    if (this.deferred) this.queue.push(apply); else apply();
    return Promise.resolve();
  }
  private set(state: State): void {
    if (state === this.state) return;
    this.state = state;
    for (const listener of [...this.listeners]) listener();
  }
}

beforeEach(() => vi.stubGlobal('AudioContext', FakeAudioContext));
afterEach(() => vi.unstubAllGlobals());

function rig() {
  const ctx = new FakeAudioContext();
  const audio = createCarAudioDebug('camaro', ctx as unknown as BaseAudioContext);
  return { ctx, audio };
}

describe('pausing the engine sound when iOS interrupts audio', () => {
  it('suspends a context that is already interrupted when the game pauses', () => {
    const { ctx, audio } = rig();
    ctx.platform('interrupted'); // backgrounded: the audio session was taken before visibilitychange paused the race
    audio.suspend();
    expect(ctx.calls).toEqual(['suspend']);
    expect(ctx.state).toBe('suspended');
  });

  it('keeps the audio paused if the platform brings it back by itself while the game is paused', () => {
    const { ctx, audio } = rig();
    ctx.platform('interrupted');
    audio.suspend();
    ctx.platform('running'); // WebKit resumes on return to the page, over the pause menu
    expect(ctx.state).toBe('suspended');
    ctx.platform('interrupted'); ctx.platform('running');
    expect(ctx.state).toBe('suspended');
  });

  it('keeps the audio paused when a resume requested before the pause lands after it', () => {
    const { ctx, audio } = rig();
    ctx.platform('suspended'); // autoplay policy: the start() resume is still waiting
    audio.suspend();
    ctx.platform('running'); // the start() resume completes while the pause menu is open
    expect(ctx.state).toBe('suspended');
  });

  it('does not suspend again once the game has resumed', () => {
    const { ctx, audio } = rig();
    audio.suspend();
    audio.resume();
    expect(ctx.state).toBe('running');
    ctx.calls.length = 0;
    ctx.platform('interrupted'); ctx.platform('running');
    expect(ctx.calls).toEqual([]);
    expect(ctx.state).toBe('running');
  });

  it('resumes a context that is suspended or interrupted', () => {
    for (const state of ['suspended', 'interrupted'] as const) {
      const { ctx, audio } = rig();
      ctx.platform(state);
      audio.resume();
      expect(ctx.calls).toEqual(['resume']);
      expect(ctx.state).toBe('running');
    }
  });

  it('resumes after a suspend that the context has not reported yet', () => {
    const { ctx, audio } = rig();
    ctx.deferred = true;
    audio.suspend();
    audio.resume(); // still reports running here, but the suspend is queued ahead of this
    ctx.flush();
    expect(ctx.calls).toEqual(['suspend', 'resume']);
    expect(ctx.state).toBe('running');
  });

  it('leaves a closed context alone', () => {
    const { ctx, audio } = rig();
    ctx.platform('closed');
    audio.suspend();
    audio.resume();
    expect(ctx.calls).toEqual([]);
  });

  it('stops watching the context once disposed', () => {
    const { ctx, audio } = rig();
    audio.suspend();
    expect(ctx.listenerCount).toBe(1);
    audio.suspend();
    expect(ctx.listenerCount).toBe(1);
    audio.dispose();
    expect(ctx.listenerCount).toBe(0);
  });
});
