import type { CarKind } from '@/car/car-specs';
import { CAR_SOUND_PROFILES, type CarSoundProfile } from '@/audio/dsp/engine-profile';
import { clamp, clamp01 } from '@/audio/dsp/math';
import { cabinLowpassHz, layerMix, type LayerMix } from '@/audio/dsp/mix-maps';
import { OverrunPopper, type PopEvent } from '@/audio/dsp/overrun';
import { createRng } from '@/audio/dsp/rng';
import { createEngineSource, type EngineControls, type EngineSource } from '@/audio/engine-source';
import { filter, finite, gain, ramp, type LayerEnv } from '@/audio/graph/audio-utils';
import type { Layer } from '@/audio/graph/layer';
import { MasterBus } from '@/audio/graph/master-bus';
import { MechanicalLayer } from '@/audio/graph/mechanical-layer';
import { NodeBag } from '@/audio/graph/node-bag';
import { buildNoiseSet } from '@/audio/graph/noise-set';
import { OneShots } from '@/audio/graph/one-shots';
import { SurfaceLayer } from '@/audio/graph/surface-layer';
import { TyreLayer } from '@/audio/graph/tyre-layer';
import { WindLayer } from '@/audio/graph/wind-layer';
import type { CarAudio, CarAudioFrame } from '@/types/audio';

export type EngineMode = 'worklet' | 'fallback' | 'none';

export interface CarAudioOptions {
  /** Skip the AudioWorklet and use the oscillator + WaveShaper engine. */
  forceFallback?: boolean;
}

/** CarAudio plus the introspection hooks used by the harness and offline tests. */
export interface CarAudioDebug extends CarAudio {
  readonly ready: boolean;
  readonly engineMode: EngineMode;
  readonly workletError: string | undefined;
  readonly analyser: AnalyserNode | null;
  readonly context: BaseAudioContext | null;
  /** Build the graph without touching the context state (offline rendering). */
  init(): Promise<void>;
  /** Jump engine controls to `frame` immediately (no ramp), then run a normal update. */
  snap(frame: CarAudioFrame): void;
}

interface Buses {
  exhaust: GainNode;
  intake: GainNode;
  mechanical: GainNode;
  tyre: GainNode;
  surface: GainNode;
  wind: GainNode;
  impact: GainNode;
  cabinLp: BiquadFilterNode;
  boom: BiquadFilterNode;
}

function isRealtime(ctx: BaseAudioContext | null): ctx is AudioContext {
  return typeof AudioContext !== 'undefined' && ctx instanceof AudioContext;
}

function engineControls(f: CarAudioFrame): EngineControls {
  return {
    rpm: clamp(finite(f.rpm), 0, 12000),
    load: clamp01(finite(f.load)),
    throttle: clamp01(finite(f.throttle)),
    limiter: f.onLimiter,
  };
}

class CarAudioEngine implements CarAudioDebug {
  private readonly profile: CarSoundProfile;
  private ctx: BaseAudioContext | null;
  private ownsCtx = false;
  private readonly bag = new NodeBag();
  private starting: Promise<void> | null = null;
  private built = false;
  private disposed = false;
  private volume = 0.85;
  private master: MasterBus | null = null;
  private engine: EngineSource | null = null;
  private buses: Buses | null = null;
  private layers: Layer[] = [];
  private mechanical: MechanicalLayer | null = null;
  private oneShots: OneShots | null = null;
  private readonly popper: OverrunPopper;
  private readonly popEvents: PopEvent[] = [];
  private prevGear = 0;
  private modeError: string | undefined;

  constructor(
    kind: CarKind,
    context: BaseAudioContext | undefined,
    private readonly options: CarAudioOptions,
  ) {
    this.profile = CAR_SOUND_PROFILES[kind];
    this.ctx = context ?? null;
    this.popper = new OverrunPopper(createRng(this.profile.seed ^ 0xb0b));
  }

  get ready(): boolean {
    return this.built && !this.disposed;
  }
  get engineMode(): EngineMode {
    return this.engine?.mode ?? 'none';
  }
  get workletError(): string | undefined {
    return this.modeError;
  }
  get analyser(): AnalyserNode | null {
    return this.master?.analyser ?? null;
  }
  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  start(): Promise<void> {
    this.starting ??= this.doStart();
    return this.starting;
  }

  private async doStart(): Promise<void> {
    if (this.disposed) return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this.ownsCtx = true;
    }
    if (isRealtime(this.ctx) && this.ctx.state === 'suspended') await this.ctx.resume();
    await this.init();
  }

  async init(): Promise<void> {
    if (this.built || this.disposed || !this.ctx) return;
    const ctx = this.ctx;
    const env: LayerEnv = { ctx, bag: this.bag, noise: buildNoiseSet(ctx), profile: this.profile };
    const master = new MasterBus(env);
    const buses = this.buildBuses(env, master);
    const { engine, workletError } = await createEngineSource(env, this.options.forceFallback);
    if (this.disposed) return;
    engine.exhaust.connect(buses.exhaust);
    engine.intake.connect(buses.intake);
    this.master = master;
    this.buses = buses;
    this.engine = engine;
    this.modeError = workletError;
    this.mechanical = new MechanicalLayer(env, buses.mechanical);
    this.layers = [
      this.mechanical,
      new TyreLayer(env, buses.tyre),
      new SurfaceLayer(env, buses.surface),
      new WindLayer(env, buses.wind),
    ];
    this.oneShots = new OneShots(env, { exhaust: buses.exhaust, mechanical: buses.mechanical, impact: buses.impact });
    const t = ctx.currentTime;
    master.setVolume(this.volume, t);
    engine.snap({ rpm: this.profile.idleRpm, load: 0.1, throttle: 0, limiter: false }, t);
    this.applyBuses(layerMix(0), 0, t, true);
    this.built = true;
  }

  private buildBuses(env: LayerEnv, master: MasterBus): Buses {
    const out = master.input;
    const exhaust = gain(env, 1);
    const cabinLp = filter(env, 'lowpass', 16000, 0.6);
    const boom = filter(env, 'peaking', 95, 1.0, 0);
    exhaust.connect(cabinLp);
    cabinLp.connect(boom);
    boom.connect(out);
    return {
      exhaust,
      cabinLp,
      boom,
      intake: gain(env, 0, out),
      mechanical: gain(env, 0, out),
      tyre: gain(env, 0, out),
      surface: gain(env, 0, out),
      wind: gain(env, 0, out),
      impact: gain(env, 1, out),
    };
  }

  /** Bus gains and cabin colour for the camera position. */
  private applyBuses(mix: LayerMix, interior: number, t: number, immediate = false): void {
    const b = this.buses;
    if (!b) return;
    const tc = immediate ? 0.001 : 0.06;
    ramp(b.exhaust.gain, mix.exhaust, t, tc);
    ramp(b.intake.gain, mix.intake, t, tc);
    ramp(b.mechanical.gain, mix.mechanical, t, tc);
    ramp(b.tyre.gain, mix.tyre, t, tc);
    ramp(b.surface.gain, mix.surface, t, tc);
    ramp(b.wind.gain, mix.wind, t, tc);
    ramp(b.cabinLp.frequency, cabinLowpassHz(interior), t, tc + 0.02);
    ramp(b.boom.gain, 4 * clamp01(interior), t, tc + 0.02);
  }

  update(frame: CarAudioFrame, dt: number): void {
    const ctx = this.ctx;
    const engine = this.engine;
    if (!this.built || this.disposed || !ctx || !engine) return;
    const t = ctx.currentTime;
    const step = clamp(finite(dt, 1 / 60), 0.001, 0.1);
    const f = frame.speedKmh < 0 ? { ...frame, speedKmh: -frame.speedKmh } : frame;
    const interior = clamp01(finite(f.interior));
    const mix = layerMix(interior);
    engine.setControls(engineControls(f), t);
    this.applyBuses(mix, interior, t);
    for (const layer of this.layers) layer.update(f, t, mix);
    this.triggerEvents(f, step, t);
    this.prevGear = f.gear;
  }

  snap(frame: CarAudioFrame): void {
    const ctx = this.ctx;
    if (!this.built || !ctx || !this.engine) return;
    this.engine.snap(engineControls(frame), ctx.currentTime);
    this.prevGear = frame.gear;
    this.update({ ...frame, shifted: false }, 1 / 60);
  }

  private triggerEvents(f: CarAudioFrame, dt: number, t: number): void {
    const shots = this.oneShots;
    if (!shots) return;
    this.popEvents.length = 0;
    this.popper.step(
      dt,
      {
        rpm: f.rpm,
        throttle: f.throttle,
        onLimiter: f.onLimiter,
        idleRpm: this.profile.idleRpm,
        limiterRpm: this.profile.limiterRpm,
      },
      this.popEvents,
    );
    for (const e of this.popEvents) shots.pop(t + e.delay, e.level, e.size);
    if (f.shifted) this.onShift(f, t, shots);
  }

  private onShift(f: CarAudioFrame, t: number, shots: OneShots): void {
    const load = clamp01(f.load);
    this.engine?.cut(t, 0.05);
    this.mechanical?.dip(t, 0.07);
    shots.crack(t + 0.01, 0.55 + 0.45 * load);
    if (f.gear > this.prevGear) {
      if (load > 0.5) shots.pop(t + 0.055, 0.5 * load, 1);
    } else {
      shots.pop(t + 0.04, 0.45, 0);
    }
  }

  impact(energy: number): void {
    if (!this.built || this.disposed || !this.ctx) return;
    this.oneShots?.impact(this.ctx.currentTime, energy);
  }

  setMasterVolume(v: number): void {
    this.volume = clamp(finite(v, 1), 0, 1.5);
    if (this.master && this.ctx) this.master.setVolume(this.volume, this.ctx.currentTime);
  }

  suspend(): void {
    const ctx = this.ctx;
    if (isRealtime(ctx) && ctx.state === 'running') ctx.suspend().catch(() => undefined);
  }

  resume(): void {
    const ctx = this.ctx;
    if (isRealtime(ctx) && ctx.state === 'suspended') ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.oneShots?.stopAll();
    this.bag.disposeAll();
    if (this.ownsCtx && isRealtime(this.ctx)) this.ctx.close().catch(() => undefined);
    this.engine = null;
    this.master = null;
    this.buses = null;
    this.layers = [];
  }
}

export function createCarAudioDebug(
  kind: CarKind,
  context?: BaseAudioContext,
  options: CarAudioOptions = {},
): CarAudioDebug {
  return new CarAudioEngine(kind, context, options);
}
