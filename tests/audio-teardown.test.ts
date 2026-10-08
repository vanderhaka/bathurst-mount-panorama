import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCarAudioDebug } from '@/audio/car-audio';
import { CAR_SOUND_PROFILES } from '@/audio/dsp/engine-profile';
import { ENGINE_PROCESSOR_NAME, ENGINE_STOP, ENGINE_STOPPED } from '@/audio/engine-constants';
import { ENGINE_STOP_TIMEOUT_MS } from '@/audio/engine-source';

// Chrome keeps an AudioWorkletNode alive while its processor is active, and the node keeps its AudioContext:
// a context closed with the engine processor still running is never collected (one per race, measured live).

/** One end of a MessagePort: records what is posted and delivers what the other end sends. */
class FakePort {
  readonly posted: unknown[] = [];
  closed = false;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  postMessage(data: unknown): void { this.posted.push(data); }
  close(): void { this.closed = true; }
  deliver(data: unknown): void { this.onmessage?.({ data }); }
}
class FakeParam {
  value = 0;
  setTargetAtTime(): void {}
  setValueAtTime(): void {}
  cancelScheduledValues(): void {}
}
class FakeNode {
  readonly gain = new FakeParam();
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
  readonly playbackRate = new FakeParam();
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
  buffer: unknown = null;
  curve: unknown = null;
  loop = false;
  type = '';
  oversample = '';
  fftSize = 0;
  smoothingTimeConstant = 0;
  disconnected = false;
  connect<T>(out: T): T { return out; }
  disconnect(): void { this.disconnected = true; }
  start(): void {}
  stop(): void {}
  setPeriodicWave(): void {}
}
class FakeWorkletNode extends FakeNode {
  static made: FakeWorkletNode[] = [];
  readonly port = new FakePort();
  readonly parameters = new Map(['rpm', 'load', 'throttle', 'limiter', 'cut'].map((n) => [n, new FakeParam()]));
  constructor(_ctx: unknown, readonly name: string) { super(); FakeWorkletNode.made.push(this); }
}
/** A realtime context: control calls are recorded and take effect at once. */
class FakeAudioContext {
  static made: FakeAudioContext[] = [];
  state: 'suspended' | 'running' | 'closed' = 'running';
  readonly calls: string[] = [];
  readonly currentTime = 0;
  readonly sampleRate = 48000;
  readonly destination = new FakeNode();
  readonly audioWorklet = { addModule: (): Promise<void> => Promise.resolve() };
  constructor() { FakeAudioContext.made.push(this); }
  addEventListener(): void {}
  removeEventListener(): void {}
  suspend(): Promise<void> { return this.request('suspend', 'suspended'); }
  resume(): Promise<void> { return this.request('resume', 'running'); }
  close(): Promise<void> { return this.request('close', 'closed'); }
  createGain(): FakeNode { return new FakeNode(); }
  createBiquadFilter(): FakeNode { return new FakeNode(); }
  createOscillator(): FakeNode { return new FakeNode(); }
  createBufferSource(): FakeNode { return new FakeNode(); }
  createWaveShaper(): FakeNode { return new FakeNode(); }
  createDynamicsCompressor(): FakeNode { return new FakeNode(); }
  createAnalyser(): FakeNode { return new FakeNode(); }
  createPeriodicWave(): object { return {}; }
  createBuffer(_channels: number, length: number, sr: number): object { return { duration: length / sr, copyToChannel(): void {} }; }
  private request(name: string, state: FakeAudioContext['state']): Promise<void> {
    this.calls.push(name);
    if (this.state === 'closed') return Promise.reject(new Error('InvalidStateError'));
    this.state = state;
    return Promise.resolve();
  }
}

beforeEach(() => {
  FakeAudioContext.made = [];
  FakeWorkletNode.made = [];
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('AudioParam', FakeParam);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

/** A race's audio as the game makes it (it owns the context), started, then paused from the menu. */
async function pausedRace() {
  const audio = createCarAudioDebug('camaro');
  await audio.start();
  const [ctx] = FakeAudioContext.made;
  const [node] = FakeWorkletNode.made;
  expect(audio.engineMode).toBe('worklet');
  expect(node.name).toBe(ENGINE_PROCESSOR_NAME);
  audio.suspend();
  ctx.calls.length = 0;
  return { audio, ctx, node };
}

describe('ending a race releases its audio context', () => {
  it('stops the engine worklet, then closes the paused context once the processor has ended', async () => {
    const { audio, ctx, node } = await pausedRace();
    audio.dispose(); // Quit to menu
    expect(node.port.posted).toEqual([ENGINE_STOP]);
    expect(node.disconnected).toBe(true); // silent before it runs again
    expect(ctx.calls).toEqual(['resume']); // a suspended context never calls process(), so the processor could not end
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.calls).toEqual(['resume']);
    node.port.deliver(ENGINE_STOPPED);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.calls).toEqual(['resume', 'close']);
    expect(node.port.closed).toBe(true);
  });

  it('still closes the context if the processor never confirms', async () => {
    vi.useFakeTimers();
    const { audio, ctx } = await pausedRace();
    audio.dispose();
    await vi.advanceTimersByTimeAsync(ENGINE_STOP_TIMEOUT_MS - 1);
    expect(ctx.calls).toEqual(['resume']);
    await vi.advanceTimersByTimeAsync(1);
    expect(ctx.calls).toEqual(['resume', 'close']);
  });

  it('stops the processor of a shared context without resuming or closing it', async () => {
    const shared = new FakeAudioContext();
    const audio = createCarAudioDebug('camaro', shared as unknown as BaseAudioContext);
    await audio.start();
    audio.suspend();
    shared.calls.length = 0;
    audio.dispose();
    expect(FakeWorkletNode.made[0].port.posted).toEqual([ENGINE_STOP]);
    expect(shared.calls).toEqual([]);
  });
});

interface ProcessorLike {
  readonly port: FakePort;
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
}
type ProcessorCtor = new (options: unknown) => ProcessorLike;

describe('engine worklet processor', () => {
  it('keeps rendering until told to stop, then ends and confirms it has', async () => {
    const registered: ProcessorCtor[] = [];
    vi.stubGlobal('sampleRate', 48000);
    vi.stubGlobal('AudioWorkletProcessor', class { readonly port = new FakePort(); });
    vi.stubGlobal('registerProcessor', (_name: string, ctor: ProcessorCtor) => { registered.push(ctor); });
    await import('@/audio/engine-processor');
    const processor = new registered[0]({ processorOptions: { profile: CAR_SOUND_PROFILES.camaro } });
    const outputs = [[new Float32Array(128)], [new Float32Array(128)]];
    const params = { rpm: new Float32Array([4000]), load: new Float32Array([0.6]), throttle: new Float32Array([0.6]), limiter: new Float32Array([0]), cut: new Float32Array([0]) };
    expect(processor.process([], outputs, params)).toBe(true);
    expect(processor.process([], outputs, params)).toBe(true);
    processor.port.deliver(ENGINE_STOP);
    expect(processor.process([], outputs, params)).toBe(false);
    expect(processor.port.posted).toEqual([ENGINE_STOPPED]);
  });
});
