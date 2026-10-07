import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { CAR_SOUND_PROFILES } from '@/audio/dsp/engine-profile';
import { EngineSynth } from '@/audio/dsp/engine-synth';
import {
  bankGaps,
  buildFiringSlots,
  CHEVY_LAYOUT,
  cycleFrequencyHz,
  FLAT_PLANE_LAYOUT,
  firingFrequencyHz,
  FORD_LAYOUT,
} from '@/audio/dsp/firing';
import {
  cabinLowpassHz,
  gearWhineHz,
  kerbRumbleHz,
  layerMix,
  squealGain,
  surfaceWeights,
  whineGain,
  windGain,
} from '@/audio/dsp/mix-maps';
import { synthImpact, synthNoise, synthPop, synthShiftCrack } from '@/audio/dsp/oneshot-synth';
import { OverrunPopper, type PopEvent } from '@/audio/dsp/overrun';
import {
  buildPulseTable,
  orderAmplitudes,
  patternHarmonics,
  renderPatternCycle,
} from '@/audio/dsp/pulse-shape';
import { createRng } from '@/audio/dsp/rng';
import {
  findPeaks,
  levelNear,
  magnitudeSpectrum,
  peakAbs,
  rmsDb,
  spectralCentroid,
  thirdOctaveDb,
} from '@/audio/dsp/spectrum';

const SR = 48000;
const KINDS: readonly CarKind[] = ['camaro', 'mustang'];

function renderEngine(kind: CarKind, rpm: number, load: number, seconds = 1.5, limiter = 0): Float32Array {
  const synth = new EngineSynth(CAR_SOUND_PROFILES[kind], SR);
  const n = Math.round(SR * seconds);
  const ex = new Float32Array(n);
  const inl = new Float32Array(n);
  for (let o = 0; o < n; o += 128) {
    const len = Math.min(128, n - o);
    synth.process(ex.subarray(o, o + len), inl.subarray(o, o + len), len, {
      rpm: [rpm],
      load: [load],
      throttle: load > 0.5 ? 1 : 0,
      limiter,
      cut: 0,
    });
  }
  return ex;
}

describe('firing geometry', () => {
  it('computes V8 firing frequency as rpm/60 x 4 and the cycle at half the rev rate', () => {
    expect(firingFrequencyHz(3000)).toBe(200);
    expect(firingFrequencyHz(7500)).toBe(500);
    expect(cycleFrequencyHz(6000)).toBe(50);
  });

  it('gives each cross-plane bank the uneven 3-2-1-2 pulse gaps (burble source)', () => {
    for (const layout of [CHEVY_LAYOUT, FORD_LAYOUT]) {
      const slots = buildFiringSlots(layout);
      expect(slots).toHaveLength(8);
      for (const bank of [0, 1] as const) {
        const gaps = bankGaps(slots, bank);
        expect(gaps.reduce((a, b) => a + b, 0)).toBe(8);
        expect([...gaps].sort()).toEqual([1, 2, 2, 3]);
      }
    }
  });

  it('flat-plane alternates banks so every bank gap is two slots', () => {
    const slots = buildFiringSlots(FLAT_PLANE_LAYOUT);
    expect(slots.every((s) => s.gapSlots === 2)).toBe(true);
  });

  it('fires every cylinder exactly once per cycle', () => {
    for (const layout of [CHEVY_LAYOUT, FORD_LAYOUT]) {
      expect([...layout.firingOrder].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    }
  });
});

describe('pulse pattern', () => {
  it('builds a peak-normalised, non-negative pulse that decays to zero', () => {
    const t = buildPulseTable(0.1, 0.4);
    expect(Math.max(...t)).toBeCloseTo(1, 5);
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
    expect(t[t.length - 2]).toBeCloseTo(0, 4);
    expect(t[t.length - 1]).toBe(0);
  });

  it('puts the strongest order on the firing order (4) and keeps cross-plane sub-orders', () => {
    for (const kind of KINDS) {
      const p = CAR_SOUND_PROFILES[kind];
      const cycle = renderPatternCycle({
        slots: buildFiringSlots(p.layout),
        cylinderGain: p.cylinderGain,
        gapGain: p.gapGain,
        pulse: buildPulseTable(p.pulseAttackSlots, p.pulseDecaySlots),
      });
      const orders = orderAmplitudes(patternHarmonics(cycle, 32));
      const fire = orders.get(4) ?? 0;
      for (const [order, amp] of orders) {
        if (order !== 4 && order <= 8) expect(fire).toBeGreaterThan(amp);
      }
      expect(orders.get(2) ?? 0).toBeGreaterThan(0.02 * fire);
    }
  });

  it('is lumpier (more half-order content) on the Camaro than the Mustang', () => {
    const half = (kind: CarKind): number => {
      const p = CAR_SOUND_PROFILES[kind];
      const cycle = renderPatternCycle({
        slots: buildFiringSlots(p.layout),
        cylinderGain: p.cylinderGain,
        gapGain: p.gapGain,
        pulse: buildPulseTable(p.pulseAttackSlots, p.pulseDecaySlots),
      });
      const o = orderAmplitudes(patternHarmonics(cycle, 32));
      return (o.get(2) ?? 0) / (o.get(4) ?? 1);
    };
    expect(half('camaro')).toBeGreaterThan(half('mustang'));
  });
});

describe('engine profiles', () => {
  it('track the car specs and differ audibly between Camaro and Mustang', () => {
    const c = CAR_SOUND_PROFILES.camaro;
    const m = CAR_SOUND_PROFILES.mustang;
    expect(c.limiterRpm).toBe(CAR_SPECS.camaro.engine.limiterRpm);
    expect(m.limiterRpm).toBe(CAR_SPECS.mustang.engine.limiterRpm);
    expect(c.pulseDecaySlots).toBeGreaterThan(m.pulseDecaySlots);
    expect(c.brightHz.full).toBeLessThan(m.brightHz.full);
    expect(c.formants[0].hz).toBeLessThan(m.formants[0].hz);
    expect(c.mechanical.valvetrainHz).toBeLessThan(m.mechanical.valvetrainHz);
  });
});

describe('EngineSynth (rendered in node)', () => {
  it('puts the dominant low-frequency peak at the firing frequency within 5%', () => {
    for (const kind of KINDS) {
      for (const rpm of [2500, 3000, 4500, 6000]) {
        const samples = renderEngine(kind, rpm, 1);
        const spec = magnitudeSpectrum(samples, SR, Math.round(0.5 * SR), 32768);
        const fire = firingFrequencyHz(rpm);
        const top = findPeaks(spec, 25, fire * 1.25, 4)[0];
        const candidates = [fire, fire / 2, fire / 4];
        const err = Math.min(...candidates.map((c) => Math.abs(top.hz - c) / c));
        expect(err, `${kind} @ ${rpm} rpm: peak ${top.hz.toFixed(1)} Hz`).toBeLessThan(0.05);
        expect(levelNear(spec, fire, 3)).toBeGreaterThan(top.db - 12);
      }
    }
  });

  it('scales pitch linearly with rpm', () => {
    const peakAt = (rpm: number): number => {
      const spec = magnitudeSpectrum(renderEngine('mustang', rpm, 1), SR, Math.round(0.5 * SR), 32768);
      const f = firingFrequencyHz(rpm);
      return findPeaks(spec, f * 0.95, f * 1.05, 1)[0].hz;
    };
    expect(peakAt(4500) / peakAt(3000)).toBeCloseTo(1.5, 2);
  });

  it('never clips or produces NaN and sits at a sensible level', () => {
    for (const kind of KINDS) {
      for (const [rpm, load] of [
        [1100, 0.1],
        [4000, 1],
        [7400, 1],
      ]) {
        const s = renderEngine(kind, rpm, load);
        expect(s.some((v) => Number.isNaN(v))).toBe(false);
        expect(peakAbs(s)).toBeLessThan(0.6);
        expect(rmsDb(s, SR / 2)).toBeGreaterThan(-50);
      }
    }
  });

  it('is brighter on throttle than on overrun, for both cars', () => {
    for (const kind of KINDS) {
      const on = spectralCentroid(magnitudeSpectrum(renderEngine(kind, 4500, 1), SR, SR / 2, 32768));
      const off = spectralCentroid(magnitudeSpectrum(renderEngine(kind, 4500, 0.05), SR, SR / 2, 32768));
      expect(on).toBeGreaterThan(off);
    }
  });

  it('sounds different: Mustang has a higher spectral centroid and different band balance', () => {
    const spec = (k: CarKind) => magnitudeSpectrum(renderEngine(k, 4500, 1), SR, SR / 2, 32768);
    const sc = spec('camaro');
    const sm = spec('mustang');
    expect(spectralCentroid(sm)).toBeGreaterThan(spectralCentroid(sc) * 1.3);
    const a = thirdOctaveDb(sc);
    const b = thirdOctaveDb(sm);
    const rmsDiff = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
    expect(rmsDiff).toBeGreaterThan(3);
  });

  it('is deterministic for a given seed and differs between seeds', () => {
    const a = renderEngine('camaro', 3000, 1, 0.3);
    const b = renderEngine('camaro', 3000, 1, 0.3);
    expect(Array.from(a.slice(0, 2000))).toEqual(Array.from(b.slice(0, 2000)));
    const other = new EngineSynth(CAR_SOUND_PROFILES.camaro, SR, 99);
    const o = new Float32Array(128);
    other.process(o, new Float32Array(128), 128, { rpm: [3000], load: [1], throttle: 1, limiter: 0, cut: 0 });
    expect(Array.from(o)).not.toEqual(Array.from(a.slice(0, 128)));
  });

  it('stays smooth through a fast rpm sweep (no zipper steps)', () => {
    const synth = new EngineSynth(CAR_SOUND_PROFILES.camaro, SR);
    const n = SR;
    const rpm = new Float32Array(128);
    const ex = new Float32Array(128);
    const inl = new Float32Array(128);
    let prev = 0;
    let maxStep = 0;
    for (let o = 0; o < n; o += 128) {
      for (let i = 0; i < 128; i++) rpm[i] = 2000 + (5000 * (o + i)) / n;
      synth.process(ex, inl, 128, { rpm, load: [1], throttle: 1, limiter: 0, cut: 0 });
      for (let i = 0; i < 128; i++) {
        maxStep = Math.max(maxStep, Math.abs(ex[i] - prev));
        prev = ex[i];
      }
    }
    expect(Number.isFinite(maxStep)).toBe(true);
    expect(maxStep).toBeLessThan(0.15);
  });

  it('stutters on the limiter and mutes on a full ignition cut', () => {
    const win = Math.round(0.01 * SR);
    const std = (s: Float32Array): number => {
      const v: number[] = [];
      for (let i = SR / 2; i + win < s.length; i += win) v.push(rmsDb(s, i, i + win));
      const mean = v.reduce((a, b) => a + b, 0) / v.length;
      return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    };
    expect(std(renderEngine('camaro', 7400, 1, 1.5, 1))).toBeGreaterThan(2 * std(renderEngine('camaro', 7400, 1, 1.5, 0)));
    const synth = new EngineSynth(CAR_SOUND_PROFILES.mustang, SR);
    const ex = new Float32Array(128);
    const inl = new Float32Array(128);
    for (let o = 0; o < 40; o++) synth.process(ex, inl, 128, { rpm: [5000], load: [1], throttle: 1, limiter: 0, cut: 1 });
    expect(peakAbs(ex)).toBeLessThan(0.02);
  });
});

describe('OverrunPopper', () => {
  const drive = (seed: number, rpmAt: (t: number) => number, thrAt: (t: number) => number, seconds: number): PopEvent[] => {
    const popper = new OverrunPopper(createRng(seed));
    const all: PopEvent[] = [];
    const ev: PopEvent[] = [];
    for (let t = 0; t < seconds; t += 1 / 60) {
      ev.length = 0;
      popper.step(1 / 60, { rpm: rpmAt(t), throttle: thrAt(t), onLimiter: false, idleRpm: 1100, limiterRpm: 7500 }, ev);
      for (const e of ev) all.push({ ...e, delay: t + e.delay });
    }
    return all;
  };

  it('is silent at idle and on throttle', () => {
    expect(drive(1, () => 1100, () => 0, 5)).toHaveLength(0);
    expect(drive(1, () => 6500, () => 1, 5)).toHaveLength(0);
  });

  it('bangs on a high-rpm lift-off, then burbles with a decaying rate', () => {
    const lift = 0.5;
    const pops = drive(7, (t) => (t < lift ? 6800 : 6800 - (t - lift) * 800), (t) => (t < lift ? 1 : 0), 5);
    expect(pops[0].size).toBe(2);
    expect(pops[0].delay).toBeGreaterThan(lift - 0.01);
    expect(pops.length).toBeGreaterThan(8);
    const early = pops.filter((p) => p.delay > lift && p.delay < lift + 1.5).length;
    const late = pops.filter((p) => p.delay > lift + 3 && p.delay < lift + 4.5).length;
    expect(early).toBeGreaterThan(late);
  });

  it('does not bang when lifting at low rpm', () => {
    const pops = drive(3, () => 3000, (t) => (t < 0.5 ? 1 : 0), 1);
    expect(pops.filter((p) => p.size === 2)).toHaveLength(0);
  });

  it('is deterministic for a seed', () => {
    const run = () => drive(11, () => 6500, (t) => (t < 0.3 ? 1 : 0), 3);
    expect(run()).toEqual(run());
  });
});

describe('mix maps', () => {
  it('wind rises with speed squared', () => {
    expect(windGain(0)).toBe(0);
    expect(windGain(200) / windGain(100)).toBeCloseTo(4, 5);
  });

  it('squeal needs slip and gets louder with speed', () => {
    expect(squealGain(0, 200)).toBe(0);
    expect(squealGain(0.05, 200)).toBe(0);
    expect(squealGain(0.9, 200)).toBeGreaterThan(squealGain(0.4, 200));
    expect(squealGain(0.9, 180)).toBeGreaterThan(squealGain(0.9, 60));
  });

  it('kerb rumble rate follows speed and stays in a sane range', () => {
    expect(kerbRumbleHz(100)).toBeGreaterThan(kerbRumbleHz(50));
    expect(kerbRumbleHz(0)).toBeGreaterThanOrEqual(6);
    expect(kerbRumbleHz(400)).toBeLessThanOrEqual(110);
  });

  it('weights one surface at a time', () => {
    expect(surfaceWeights('kerb')).toEqual({ kerb: 1, gravel: 0, grass: 0 });
    expect(surfaceWeights('asphalt')).toEqual({ kerb: 0, gravel: 0, grass: 0 });
  });

  it('puts the exhaust forward outside and induction + gearbox forward in the cockpit', () => {
    const out = layerMix(0);
    const inn = layerMix(1);
    expect(out.exhaust).toBeGreaterThan(out.intake);
    expect(inn.intake).toBeGreaterThan(inn.exhaust);
    expect(inn.mechanical).toBeGreaterThan(out.mechanical);
    expect(cabinLowpassHz(1)).toBeLessThan(cabinLowpassHz(0));
  });

  it('derives gear whine from shaft speeds and mutes it in neutral', () => {
    const w = gearWhineHz(6000, 200, 0.343, 3.36, 19, 11);
    expect(w.inputHz).toBeCloseTo(1900, 5);
    expect(w.pinionHz).toBeGreaterThan(0);
    expect(gearWhineHz(6000, 100, 0.343, 3.36, 19, 11).pinionHz).toBeCloseTo(w.pinionHz / 2, 3);
    expect(whineGain(0, 1)).toBe(0);
    expect(whineGain(3, 1)).toBeGreaterThan(whineGain(3, 0));
  });
});

describe('one-shot synthesis', () => {
  it('produces finite, peak-normalised pops, cracks and impacts', () => {
    const bufs = [
      synthPop(SR, 0, createRng(1)),
      synthPop(SR, 1, createRng(2)),
      synthPop(SR, 2, createRng(3)),
      synthShiftCrack(SR, createRng(4)),
      synthImpact(SR, 5),
    ];
    for (const b of bufs) {
      expect(b.some((v) => !Number.isFinite(v))).toBe(false);
      expect(peakAbs(b)).toBeCloseTo(0.9, 3);
    }
    expect(bufs[2].length).toBeGreaterThan(bufs[0].length);
  });

  it('makes brown noise darker than white noise', () => {
    const white = synthNoise(SR, 'white', 1, 1);
    const brown = synthNoise(SR, 'brown', 1, 1);
    const c = (s: Float32Array): number => spectralCentroid(magnitudeSpectrum(s, SR, 0, 16384), 20, 20000);
    expect(c(brown)).toBeLessThan(c(white) / 3);
  });
});

describe('spectrum analysis', () => {
  it('reads a full-scale sine as 0 dB at the right frequency', () => {
    const size = 32768;
    const hz = (300 * SR) / size; // exactly on an FFT bin, so Hann scalloping loss is zero
    const s = new Float32Array(size);
    for (let i = 0; i < size; i++) s[i] = Math.sin((2 * Math.PI * hz * i) / SR);
    const spec = magnitudeSpectrum(s, SR, 0, size);
    const peak = findPeaks(spec, 100, 2000, 1)[0];
    expect(peak.hz).toBeCloseTo(hz, 1);
    expect(peak.db).toBeCloseTo(0, 1);
    expect(rmsDb(s)).toBeCloseTo(-3.01, 1);
  });

  it('interpolates an off-bin tone to within 0.5 Hz', () => {
    const s = new Float32Array(32768);
    for (let i = 0; i < s.length; i++) s[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
    const peak = findPeaks(magnitudeSpectrum(s, SR, 0, 32768), 100, 2000, 1)[0];
    expect(Math.abs(peak.hz - 440)).toBeLessThan(0.5);
  });
});
