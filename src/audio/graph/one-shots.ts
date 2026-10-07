import { synthImpact, synthPop, synthShiftCrack } from '@/audio/dsp/oneshot-synth';
import { clamp01, lerp, lerpLog } from '@/audio/dsp/math';
import { createRng, type Rng } from '@/audio/dsp/rng';
import { toBuffer } from '@/audio/graph/noise-set';
import { finite, type LayerEnv } from '@/audio/graph/audio-utils';

export interface OneShotBuses {
  exhaust: AudioNode;
  mechanical: AudioNode;
  impact: AudioNode;
}

const POP_LEVEL = 1.5;
const POP_SIZE_SCALE = [0.5, 0.8, 1.0] as const;
const CRACK_LEVEL = 1.1;
const IMPACT_LEVEL = 2.0;

/** Pre-rendered transient sounds triggered on events: pops, shift crack, impacts. */
export class OneShots {
  private readonly pops: AudioBuffer[];
  private readonly crackBuf: AudioBuffer;
  private readonly impacts: AudioBuffer[];
  private readonly rng: Rng;
  private readonly active = new Set<AudioBufferSourceNode>();

  constructor(
    private readonly env: LayerEnv,
    private readonly buses: OneShotBuses,
  ) {
    const sr = env.ctx.sampleRate;
    this.rng = createRng(env.profile.seed ^ 0x5eed);
    this.pops = ([0, 1, 2] as const).map((size) => toBuffer(env.ctx, synthPop(sr, size, createRng(100 + size))));
    this.crackBuf = toBuffer(env.ctx, synthShiftCrack(sr, createRng(7)));
    this.impacts = [toBuffer(env.ctx, synthImpact(sr, 301)), toBuffer(env.ctx, synthImpact(sr, 302))];
  }

  pop(t: number, level: number, size: 0 | 1 | 2): void {
    const [lo, hi] = this.env.profile.popPitch;
    const rate = lerp(lo, hi, this.rng());
    this.play(this.pops[size], t, POP_LEVEL * POP_SIZE_SCALE[size] * clamp01(level), rate, this.buses.exhaust);
  }

  crack(t: number, level: number): void {
    const rate = 0.92 + 0.16 * this.rng();
    this.play(this.crackBuf, t, CRACK_LEVEL * clamp01(level), rate, this.buses.impact);
  }

  impact(t: number, energy: number): void {
    const e = clamp01(finite(energy));
    const buf = this.impacts[Math.floor(this.rng() * this.impacts.length)];
    const rate = 1.15 - 0.35 * e;
    this.play(buf, t, IMPACT_LEVEL * (0.25 + 0.75 * Math.pow(e, 0.8)), rate, this.buses.impact, lerpLog(2500, 9000, e));
  }

  stopAll(): void {
    for (const s of this.active) {
      try {
        s.stop();
      } catch {
        /* already ended */
      }
    }
    this.active.clear();
  }

  private play(buffer: AudioBuffer, t: number, level: number, rate: number, out: AudioNode, lowpassHz?: number): void {
    const { ctx } = this.env;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = level;
    src.connect(g);
    const nodes: AudioNode[] = [g];
    if (lowpassHz) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpassHz;
      g.connect(f);
      f.connect(out);
      nodes.push(f);
    } else {
      g.connect(out);
    }
    this.active.add(src);
    src.onended = () => {
      this.active.delete(src);
      src.disconnect();
      for (const n of nodes) n.disconnect();
    };
    src.start(Math.max(t, ctx.currentTime));
  }
}
