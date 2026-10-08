import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAR_SOUND_PROFILES } from '@/audio/dsp/engine-profile';
import { gearWhineHz, kerbRumbleHz, layerMix } from '@/audio/dsp/mix-maps';
import { peakAbs } from '@/audio/dsp/spectrum';
import { createCarAudioDebug } from '@/audio/car-audio';
import { MechanicalLayer } from '@/audio/graph/mechanical-layer';
import { NodeBag } from '@/audio/graph/node-bag';
import { buildNoiseSet } from '@/audio/graph/noise-set';
import { SurfaceLayer } from '@/audio/graph/surface-layer';
import { TyreLayer } from '@/audio/graph/tyre-layer';
import { makeFrame } from '@/audio/harness/selftest-common';
import type { CarAudioFrame } from '@/types/audio';

// Records real graph construction, buffer generation and automation without a browser/GPU.
interface Automation { kind: 'set' | 'target'; value: number; time: number; tc: number }
class Param {
  value = 0;
  readonly events: Automation[] = [];
  private initial: number | null = null;
  private add(event: Automation): void {
    this.initial ??= this.value;
    this.value = event.value;
    // Web Audio keeps the list ordered by time; a new event goes after the ones already at its time.
    let i = this.events.length;
    while (i > 0 && this.events[i - 1].time > event.time) i--;
    this.events.splice(i, 0, event);
  }
  setTargetAtTime(value: number, time: number, tc = 0): void { this.add({ kind: 'target', value, time, tc }); }
  setValueAtTime(value: number, time: number): void { this.add({ kind: 'set', value, time, tc: 0 }); }
  cancelScheduledValues(time: number): void {
    for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i].time >= time) this.events.splice(i, 1);
  }
  /** What the automation timeline plays at `time` (setTarget approaches its target exponentially). */
  at(time: number): number {
    let held = this.initial ?? this.value, from = held;
    let curve: Automation | null = null;
    const now = (t: number): number => !curve ? held : curve.tc <= 0 ? curve.value : curve.value + (from - curve.value) * Math.exp(-(t - curve.time) / curve.tc);
    for (const e of this.events) {
      if (e.time > time) break;
      from = now(e.time);
      if (e.kind === 'set') { held = e.value; curve = null; } else curve = e;
    }
    return now(time);
  }
}
class Buffer {
  readonly data: Float32Array;
  readonly duration: number;
  constructor(length: number, sr: number) { this.data = new Float32Array(length); this.duration = length / sr; }
  copyToChannel(data: Float32Array): void { this.data.set(data); }
}
class Node {
  readonly gain = new Param();
  readonly frequency = new Param();
  readonly Q = new Param();
  readonly playbackRate = new Param();
  readonly threshold = new Param();
  readonly knee = new Param();
  readonly ratio = new Param();
  readonly attack = new Param();
  readonly release = new Param();
  readonly outputs: Array<Node | Param> = [];
  readonly starts: number[] = [];
  buffer: Buffer | null = null;
  wave: { real: Float32Array; imag: Float32Array } | null = null;
  loop = false;
  type = '';
  curve: Float32Array | null = null;
  oversample = '';
  fftSize = 2048;
  smoothingTimeConstant = 0;
  onended: (() => void) | null = null;
  constructor(readonly kind: string) { this.gain.value = this.playbackRate.value = 1; }
  connect(out: Node | Param): Node | Param { this.outputs.push(out); return out; }
  disconnect(): void { this.outputs.length = 0; }
  start(time = 0): void { this.starts.push(time); }
  stop(): void { this.onended?.(); }
  setPeriodicWave(wave: { real: Float32Array; imag: Float32Array }): void { this.wave = wave; }
}
class Context {
  currentTime = 0;
  readonly sampleRate = 48000;
  readonly nodes: Node[] = [];
  readonly destination = new Node('destination');
  add(kind: string): Node { const n = new Node(kind); this.nodes.push(n); return n; }
  createGain(): Node { return this.add('gain'); }
  createBiquadFilter(): Node { return this.add('filter'); }
  createOscillator(): Node { return this.add('osc'); }
  createBufferSource(): Node { return this.add('source'); }
  createWaveShaper(): Node { return this.add('shaper'); }
  createDynamicsCompressor(): Node { return this.add('compressor'); }
  createAnalyser(): Node { return this.add('analyser'); }
  createBuffer(_channels: number, length: number, sr: number): Buffer { return new Buffer(length, sr); }
  createPeriodicWave(real: Float32Array, imag: Float32Array): { real: Float32Array; imag: Float32Array } { return { real, imag }; }
}
function environment(kind: 'camaro' | 'mustang' | 'supra' = 'camaro') {
  const context = new Context();
  const ctx = context as unknown as BaseAudioContext;
  return { context, env: { ctx, bag: new NodeBag(), noise: buildNoiseSet(ctx), profile: CAR_SOUND_PROFILES[kind] } };
}
function outputGain(node: Node): Node {
  const gain = node.outputs.find((n) => n instanceof Node && n.kind === 'gain');
  if (!(gain instanceof Node)) throw new Error('sound has no output gain');
  return gain;
}
function reaches(node: Node, target: Node, visited = new Set<Node>()): boolean {
  if (node === target) return true;
  if (visited.has(node)) return false;
  visited.add(node);
  return node.outputs.some((n) => n instanceof Node && reaches(n, target, visited));
}
beforeEach(() => vi.stubGlobal('AudioParam', Param));
afterEach(() => vi.unstubAllGlobals());

describe('generated driving sound paths', () => {
  it('routes generated rubber scrub below the squeal threshold, then mutes it at rest', () => {
    const { context, env } = environment();
    const out = context.add('tyre bus');
    const layer = new TyreLayer(env, out as unknown as AudioNode);
    const band = context.nodes.find((n) => n.kind === 'filter' && n.frequency.value === 680);
    expect(band, 'missing tyre scrub noise band').toBeDefined();
    if (!band) throw new Error('missing tyre scrub');
    const scrub = outputGain(band);
    const source = context.nodes.find((n) => n.kind === 'source' && n.outputs.includes(band));
    expect(source?.starts).toHaveLength(1);
    expect(source?.loop).toBe(true);
    expect(peakAbs(source?.buffer?.data ?? new Float32Array())).toBeGreaterThan(0.1);
    expect(reaches(band, out)).toBe(true);
    const frame = makeFrame({ speedKmh: 120, slip: 0, scrub: 0.7 });
    layer.update(frame, 0, layerMix(1));
    expect(scrub.gain.value).toBeGreaterThan(0.1);
    layer.update({ ...frame, speedKmh: 0 }, 1, layerMix(1));
    expect(scrub.gain.value).toBe(0);
    layer.update({ ...frame, scrub: 0 }, 2, layerMix(1));
    expect(scrub.gain.value).toBe(0);
  });

  it('generates kerb rumble pulses whose rate follows wheel speed and gates to kerbs', () => {
    const { context, env } = environment();
    const out = context.add('surface bus');
    const layer = new SurfaceLayer(env, out as unknown as AudioNode);
    const osc = context.nodes.find((n) => n.kind === 'osc');
    const kerb = context.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(out));
    expect(osc?.wave?.imag.some((v) => v !== 0)).toBe(true);
    expect(osc?.starts).toHaveLength(1);
    const noise = context.nodes.filter((n) => n.kind === 'source' && reaches(n, out));
    expect(noise.some((n) => peakAbs(n.buffer?.data ?? new Float32Array()) > 0.1)).toBe(true);
    layer.update(makeFrame({ speedKmh: 90, surface: 'kerb' }), 0, layerMix(1));
    expect(osc?.frequency.value).toBeCloseTo(kerbRumbleHz(90));
    expect(kerb?.gain.value).toBeGreaterThan(0.5);
    layer.update(makeFrame({ speedKmh: 90, surface: 'asphalt' }), 1, layerMix(1));
    expect(kerb?.gain.value).toBe(0);
  });

  it.each(['camaro', 'mustang', 'supra'] as const)('generates %s shaft-speed gear whine with cockpit gain and neutral silence', (kind) => {
    const { context, env } = environment(kind);
    const out = context.add('mechanical bus');
    const layer = new MechanicalLayer(env, out as unknown as AudioNode);
    const [input, pinion] = context.nodes.filter((n) => n.kind === 'osc');
    const whine = context.nodes.find((n) => n.kind === 'gain' && n.outputs.includes(out));
    const frame = makeFrame({ rpm: 6000, speedKmh: 180, gear: 4, load: 1 });
    layer.update(frame, 0, layerMix(1));
    const m = env.profile.mechanical;
    // Mesh tones have non-zero generated harmonics, and their sources reach the audible bus.
    for (const osc of [input, pinion]) {
      expect(osc.wave?.imag.some((v) => v !== 0)).toBe(true);
      expect(reaches(osc, out)).toBe(true);
    }
    expect(input.frequency.value).toBeCloseTo(6000 / 60 * m.inputTeeth);
    expect(pinion.frequency.value).toBeGreaterThan(0);
    const frequencies = gearWhineHz(6000, 90, 0.343, 3.36, m.inputTeeth, m.pinionTeeth);
    expect(frequencies.inputHz).toBe(input.frequency.value);
    expect(whine?.gain.value).toBeGreaterThan(0);
    layer.update({ ...frame, gear: 0 }, 1, layerMix(1));
    expect(whine?.gain.value).toBe(0);
  });

  it.each(['camaro', 'mustang', 'supra'] as const)('%s downshift schedules one generated exhaust backfire and does not repeat it', async (kind) => {
    const context = new Context();
    const audio = createCarAudioDebug(kind, context as unknown as BaseAudioContext, { forceFallback: true });
    await audio.init();
    const base = makeFrame({ rpm: 4000, throttle: 0.5, load: 0.5, gear: 4 });
    audio.snap(base);
    const before = context.nodes.length;
    audio.update({ ...base, gear: 3, shifted: true }, 1 / 60);
    const shots = context.nodes.slice(before).filter((n) => n.kind === 'source' && !n.loop);
    const pop = shots.find((n) => Math.abs((n.buffer?.duration ?? 0) - 0.1) < 1e-6);
    expect(shots).toHaveLength(2); // mechanical crack and separate exhaust backfire
    expect(pop?.starts).toEqual([0.04]);
    expect(peakAbs(pop?.buffer?.data ?? new Float32Array())).toBeCloseTo(0.9, 3);
    expect(pop && reaches(pop, context.destination)).toBe(true);
    expect(pop && outputGain(pop).gain.value).toBeGreaterThan(0.3);
    const after = context.nodes.length;
    audio.update({ ...base, gear: 3, shifted: false }, 1 / 60);
    expect(context.nodes.length).toBe(after);
    audio.dispose();
  });
});

/** The game loop against the fake context: returns the gear-whine gain automation and its steady level. */
async function whineRig(hz: number) {
  const context = new Context();
  const audio = createCarAudioDebug('camaro', context as unknown as BaseAudioContext, { forceFallback: true });
  await audio.init();
  const osc = context.nodes.find((n) => n.kind === 'osc' && n.wave?.imag.length === 4); // whine mesh tones
  const level = osc?.outputs[0] instanceof Node ? osc.outputs[0].outputs[0] : undefined;
  if (!(level instanceof Node)) throw new Error('missing gear whine gain');
  const base = makeFrame({ rpm: 6000, speedKmh: 180, gear: 4, load: 1, interior: 1 });
  audio.snap(base);
  let n = 0;
  const frame = (over: Partial<CarAudioFrame> = {}): number => {
    context.currentTime = ++n / hz;
    audio.update({ ...base, ...over }, 1 / hz);
    return context.currentTime;
  };
  while (n < hz / 2) frame();
  const full = level.gain.at(n / hz);
  return { whine: level.gain, frame, full, shift: () => frame({ gear: 5, shifted: true }) };
}

describe('gear-whine dropout on a shift', () => {
  it.each([60, 30])('drops at the shift time and returns 70 ms later at %i fps, not a frame late', async (hz) => {
    const { whine, frame, full, shift } = await whineRig(hz);
    expect(full).toBeGreaterThan(0.01);
    const t = shift();
    for (let i = 0; i < hz / 4; i++) frame({ gear: 5 });
    expect(whine.at(t - 1e-6)).toBeCloseTo(full, 6);
    expect(whine.at(t + 0.012)).toBeLessThan(0.1 * full); // 4 ms time constant: gone within 12 ms
    expect(whine.at(t + 0.069)).toBeLessThan(0.01 * full);
    const back = whine.at(t + 0.07 + 0.03); // one 30 ms time constant after the 70 ms window
    expect(back).toBeGreaterThan(0.55 * full);
    expect(back).toBeLessThan(0.7 * full);
    expect(whine.at(t + 1)).toBeCloseTo(full, 6);
  });

  it('keeps the whine out for the whole of a second shift that lands inside the first dropout', async () => {
    const { whine, frame, full, shift } = await whineRig(60);
    const t = shift();
    frame({ gear: 5 }); frame({ gear: 5 });
    const t2 = frame({ gear: 4, shifted: true });
    for (let i = 0; i < 15; i++) frame({ gear: 4 });
    expect(t2 - t).toBeCloseTo(0.05, 9);
    expect(whine.at(t + 0.075)).toBeLessThan(0.01 * full); // the first dropout's end must not let it back in
    expect(whine.at(t2 + 0.069)).toBeLessThan(0.01 * full);
    expect(whine.at(t2 + 0.07 + 0.03)).toBeGreaterThan(0.55 * full);
  });

  it('returns to the whine level of the frames inside the dropout (torque is cut during a shift)', async () => {
    const { whine, frame, full, shift } = await whineRig(60);
    const t = shift();
    frame({ gear: 5, load: 0.2 }); frame({ gear: 5, load: 0.2 }); frame({ gear: 5, load: 0.2 });
    const coast = 0.6 * full; // whineGain: 0.5 + 0.5 x load
    // 5 ms after the 70 ms window, before any frame can have corrected a stale target (the next is at 83 ms).
    expect(whine.at(t + 0.075)).toBeCloseTo(coast * (1 - Math.exp(-0.005 / 0.03)), 6);
    for (let i = 0; i < 30; i++) frame({ gear: 5, load: 0.2 });
    expect(whine.at(t + 1)).toBeCloseTo(coast, 6);
  });
});
