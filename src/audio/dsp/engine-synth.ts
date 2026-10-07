import type { CarSoundProfile } from '@/audio/dsp/engine-profile';
import { buildFiringSlots, SLOTS, type FiringSlot } from '@/audio/dsp/firing';
import { DampedComb, DcBlocker, onePoleCoef, saturate, Svf } from '@/audio/dsp/filters';
import { clamp, clamp01, lerp } from '@/audio/dsp/math';
import {
  buildPulseTable,
  PULSE_MAX_SLOTS,
  PULSE_TABLE_SCALE,
  slotAmplitude,
  type PatternSpec,
} from '@/audio/dsp/pulse-shape';
import { createRng } from '@/audio/dsp/rng';

const VOICES = 12;
const CONTROL_INTERVAL = 32;
const LIMITER_CUT_HZ = 13;
const LIMITER_CUT_DUTY = 0.6;
const LIMITER_GATE_LOW = 0.3;

/** Per-block inputs. `rpm` and `load` hold one value (block constant) or one per sample. */
export interface EngineBlockParams {
  rpm: ArrayLike<number>;
  load: ArrayLike<number>;
  throttle: number;
  /** > 0.5 while the rev limiter is cutting. */
  limiter: number;
  /** 0..1 ignition cut (gear shift). */
  cut: number;
}

/**
 * Sample-by-sample V8 synthesiser. Eight exhaust pulses per 720 degree cycle, each
 * with its own strength and timing scatter, are routed to two banks. Each bank runs
 * through a lossy primary-pipe comb and a saturator, the banks merge into a
 * collector comb and a set of muffler resonances, then a load-dependent saturator
 * and low-pass give the throttle (bright, raspy) versus overrun (hollow) tone.
 * A second output carries the induction roar. No Web Audio types are used, so this
 * runs in an AudioWorklet and in node tests alike.
 */
export class EngineSynth {
  private readonly sr: number;
  private readonly slots: readonly FiringSlot[];
  private readonly pattern: PatternSpec;
  private readonly rng: () => number;
  private noiseState = 0x9e3779b9;

  private phase = 0;
  private slot = 0;
  private nextFire = 0;
  private readonly jitter = new Float32Array(SLOTS);
  private limiterPhase = 0;

  private readonly vAge = new Float32Array(VOICES).fill(PULSE_MAX_SLOTS);
  private readonly vAmp = new Float32Array(VOICES);
  private readonly vBank = new Uint8Array(VOICES);
  private readonly vRasp = new Float32Array(VOICES);
  private nextVoice = 0;

  private readonly dc: [DcBlocker, DcBlocker];
  private readonly primary: [DampedComb, DampedComb];
  private readonly collector: DampedComb;
  private readonly bankLp: [[number, number], [number, number]] = [
    [0, 0],
    [0, 0],
  ];
  private readonly formants: Svf[];
  private readonly rasp: Svf;
  private readonly intakeNoise: Svf;
  private readonly honk: Svf;
  private readonly postDc: DcBlocker;
  private postLp = 0;
  private gate = 1;
  private readonly postCoef: number;
  private honkImpulse = 0;

  private bankCoef = 0.2;
  private drive = 1;
  private intakeLevel = 0;
  private exhaustLevel = 0;
  private started = false;

  constructor(
    private readonly profile: CarSoundProfile,
    sampleRate: number,
    seed = profile.seed,
  ) {
    this.sr = sampleRate;
    this.rng = createRng(seed);
    this.slots = buildFiringSlots(profile.layout);
    this.pattern = {
      slots: this.slots,
      cylinderGain: profile.cylinderGain,
      gapGain: profile.gapGain,
      pulse: buildPulseTable(profile.pulseAttackSlots, profile.pulseDecaySlots),
    };
    this.dc = [new DcBlocker(sampleRate), new DcBlocker(sampleRate)];
    this.primary = [
      new DampedComb(sampleRate, profile.primaryMs[0], profile.primaryFeedback, profile.primaryDampHz),
      new DampedComb(sampleRate, profile.primaryMs[1], profile.primaryFeedback, profile.primaryDampHz),
    ];
    this.collector = new DampedComb(
      sampleRate,
      profile.collectorMs,
      profile.collectorFeedback,
      profile.collectorDampHz,
    );
    this.formants = profile.formants.map((f) => {
      const s = new Svf(sampleRate);
      s.set(f.hz, f.q);
      return s;
    });
    this.rasp = new Svf(sampleRate);
    this.rasp.set(profile.rasp.hz, profile.rasp.q);
    this.intakeNoise = new Svf(sampleRate);
    this.honk = new Svf(sampleRate);
    this.honk.set(profile.intake.honkHz, profile.intake.honkQ);
    this.postDc = new DcBlocker(sampleRate, 25);
    this.postCoef = onePoleCoef(9000, sampleRate);
    this.rollJitter();
    this.nextFire = this.jitter[0] / SLOTS;
  }

  /** White noise in -1..1 (xorshift32, cheap enough for per-sample use). */
  private noise(): number {
    let x = this.noiseState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.noiseState = x;
    return (x >>> 0) / 2147483648 - 1;
  }

  private rollJitter(): void {
    for (let s = 0; s < SLOTS; s++) this.jitter[s] = this.rng() * this.profile.timingJitter;
  }

  private fire(slotIdx: number, subSlots: number, rpm: number, load: number, p: EngineBlockParams): void {
    const prof = this.profile;
    const slot = this.slots[slotIdx];
    let amp = slotAmplitude(this.pattern, slot);
    // Scatter is larger at low rpm (lumpy idle) and shrinks as the engine smooths out.
    const lump = 1 + 2 * Math.max(0, 1 - rpm / 4000);
    amp *= 1 + prof.ampJitter * lump * (this.rng() * 2 - 1);
    amp *= 0.22 + 0.78 * Math.pow(load, 0.9);
    amp *= 1 - clamp01(p.cut);
    if (p.limiter > 0.5 && this.limiterPhase < LIMITER_CUT_DUTY) amp *= this.rng() < 0.05 ? 0.5 : 0;
    this.honkImpulse += amp * 14;
    if (amp <= 0.0001) return;
    let v = this.nextVoice;
    for (let k = 0; k < VOICES; k++) {
      const c = (this.nextVoice + k) % VOICES;
      if (this.vAge[c] >= PULSE_MAX_SLOTS) {
        v = c;
        break;
      }
    }
    this.nextVoice = (v + 1) % VOICES;
    this.vAge[v] = subSlots;
    this.vAmp[v] = amp;
    this.vBank[v] = slot.bank;
    this.vRasp[v] = 1;
  }

  /** Control-rate derived values (brightness, drive, intake colour). */
  private updateControl(rpm: number, load: number, throttle: number): void {
    const prof = this.profile;
    const rpmNorm = clamp01(rpm / 7500);
    const lp = lerp(prof.brightHz.overrun, prof.brightHz.full, Math.pow(load, 0.8)) * (0.85 + 0.3 * rpmNorm);
    this.bankCoef = onePoleCoef(lp, this.sr);
    this.drive = lerp(prof.drive.overrun, prof.drive.full, load);
    const intake = prof.intake;
    this.intakeNoise.set(lerp(intake.noiseHzLow, intake.noiseHzHigh, rpmNorm), intake.noiseQ);
    const intakeTarget = (0.03 + Math.pow(rpmNorm, 1.25)) * (0.12 + 0.88 * throttle) * intake.level;
    const exhaustTarget = prof.exhaustLevel * (0.55 + 0.45 * rpmNorm);
    if (!this.started) {
      this.intakeLevel = intakeTarget;
      this.exhaustLevel = exhaustTarget;
      this.started = true;
    } else {
      this.intakeLevel += (intakeTarget - this.intakeLevel) * 0.2;
      this.exhaustLevel += (exhaustTarget - this.exhaustLevel) * 0.2;
    }
  }

  process(exhaust: Float32Array, intake: Float32Array, count: number, p: EngineBlockParams): void {
    const prof = this.profile;
    const sr = this.sr;
    const tbl = this.pattern.pulse;
    const rpmMany = p.rpm.length > 1;
    const loadMany = p.load.length > 1;
    const raspDecaySlots = prof.rasp.decaySlots;
    const nFormants = this.formants.length;

    for (let i = 0; i < count; i++) {
      const rpm = clamp(rpmMany ? p.rpm[i] : p.rpm[0], 0, 12000);
      const load = clamp01(loadMany ? p.load[i] : p.load[0]);
      if (i % CONTROL_INTERVAL === 0) this.updateControl(rpm, load, p.throttle);

      const dph = rpm / 120 / sr;
      this.phase += dph;
      this.limiterPhase += LIMITER_CUT_HZ / sr;
      if (this.limiterPhase >= 1) this.limiterPhase -= 1;
      while (this.phase >= this.nextFire) {
        this.fire(this.slot, (this.phase - this.nextFire) * SLOTS, rpm, load, p);
        this.slot++;
        if (this.slot >= SLOTS) {
          this.slot = 0;
          this.phase -= 1;
          this.rollJitter();
        }
        this.nextFire = (this.slot + this.jitter[this.slot]) / SLOTS;
        if (dph <= 0) break;
      }

      // Pulse voices -> per-bank sums and the pulse-synchronous combustion noise.
      let b0 = 0;
      let b1 = 0;
      let rn = 0;
      const dAge = dph * SLOTS;
      const rDecay = Math.exp(-dAge / raspDecaySlots);
      for (let v = 0; v < VOICES; v++) {
        const age = this.vAge[v];
        if (age >= PULSE_MAX_SLOTS) continue;
        const pos = age * PULSE_TABLE_SCALE;
        const i0 = pos | 0;
        const val = (tbl[i0] + (tbl[i0 + 1] - tbl[i0]) * (pos - i0)) * this.vAmp[v];
        if (this.vBank[v] === 0) b0 += val;
        else b1 += val;
        rn += this.vAmp[v] * this.vRasp[v];
        this.vRasp[v] *= rDecay;
        this.vAge[v] = age + dAge;
      }

      // Per-bank pipe: DC removal, lossy end-reflection comb, 12 dB/oct low-pass, saturation.
      const a = this.bankCoef;
      const l0 = this.bankLp[0];
      const l1 = this.bankLp[1];
      const y0 = this.primary[0].process(this.dc[0].process(b0 * prof.bankGain[0]));
      const y1 = this.primary[1].process(this.dc[1].process(b1 * prof.bankGain[1]));
      l0[0] += a * (y0 - l0[0]);
      l0[1] += a * (l0[0] - l0[1]);
      l1[0] += a * (y1 - l1[0]);
      l1[1] += a * (l1[0] - l1[1]);
      const merged = saturate(l0[1], prof.bankDrive) + saturate(l1[1], prof.bankDrive);

      // Collector then muffler body resonances (parallel band-passes plus a dry path).
      const c = this.collector.process(merged);
      let body = c * prof.formantDry;
      for (let f = 0; f < nFormants; f++) body += this.formants[f].bandpass(c) * prof.formants[f].gain;

      const raspSig = this.rasp.bandpass(this.noise() * rn) * prof.rasp.gain * (0.15 + 0.85 * load);
      const sat = saturate(body + raspSig, this.drive);
      this.postLp += this.postCoef * (sat - this.postLp);
      // Limiter: the cut half-cycle also loses the pipe's resonant ring-out.
      const gateTarget = p.limiter > 0.5 && this.limiterPhase < LIMITER_CUT_DUTY ? LIMITER_GATE_LOW : 1;
      this.gate += 0.004 * (gateTarget - this.gate);
      exhaust[i] = this.postDc.process(this.postLp) * this.exhaustLevel * this.gate;

      // Induction: band-passed roar modulated at the firing frequency plus plenum honk.
      const am = 1 - prof.intake.modDepth + prof.intake.modDepth * (0.5 + 0.5 * Math.cos(2 * Math.PI * SLOTS * this.phase));
      const roar = this.intakeNoise.bandpass(this.noise()) * am * prof.intake.noiseGain;
      const honk = this.honk.bandpass(this.honkImpulse) * prof.intake.honkGain;
      this.honkImpulse = 0;
      intake[i] = (roar + honk) * this.intakeLevel * 2 * (0.5 + 0.5 * this.gate);
    }
  }
}
