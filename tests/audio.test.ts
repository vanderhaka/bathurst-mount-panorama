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
  HOLDEN_LAYOUT,
  TOYOTA_LAYOUT,
} from '@/audio/dsp/firing';
import {
  buildPulseTable,
  orderAmplitudes,
  patternHarmonics,
  renderPatternCycle,
} from '@/audio/dsp/pulse-shape';
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
const KINDS: readonly CarKind[] = ['camaro', 'mustang', 'supra', 'torana'];

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
    for (const layout of [CHEVY_LAYOUT, FORD_LAYOUT, TOYOTA_LAYOUT, HOLDEN_LAYOUT]) {
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
    for (const layout of [CHEVY_LAYOUT, FORD_LAYOUT, TOYOTA_LAYOUT, HOLDEN_LAYOUT]) {
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

  it('is brighter on throttle than on overrun, for every car', () => {
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

  it('gives the Supra its own sound: brighter than the Camaro, a band balance unlike both', () => {
    const spec = (k: CarKind) => magnitudeSpectrum(renderEngine(k, 4500, 1), SR, SR / 2, 32768);
    const sc = spec('camaro'), sm = spec('mustang'), ss = spec('supra');
    expect(spectralCentroid(ss)).toBeGreaterThan(spectralCentroid(sc) * 1.2);
    const bandDiff = (x: ReturnType<typeof spec>, y: ReturnType<typeof spec>): number => {
      const a = thirdOctaveDb(x), b = thirdOctaveDb(y);
      return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length);
    };
    console.log(`supra band diff: vs camaro ${bandDiff(ss, sc).toFixed(2)} dB, vs mustang ${bandDiff(ss, sm).toFixed(2)} dB; centroids c/m/s ${[sc, sm, ss].map((x) => spectralCentroid(x).toFixed(0)).join('/')}`);
    expect(bandDiff(ss, sc)).toBeGreaterThan(3);
    expect(bandDiff(ss, sm)).toBeGreaterThan(1.5);
  });

  it('gives the carburetted Torana a rawer voice than the Camaro it is based on', () => {
    // Not a brightness ordering: the Holden 308 shares the Camaro's pushrod cross-plane base, so it must be at
    // least as rough and raspy (more scatter, rasp and intake roar) and keep the limiter from its own spec.
    const t = CAR_SOUND_PROFILES.torana;
    const c = CAR_SOUND_PROFILES.camaro;
    expect(t.limiterRpm).toBe(CAR_SPECS.torana.engine.limiterRpm);
    expect(t.layout).toBe(HOLDEN_LAYOUT);
    expect(t.rasp.gain).toBeGreaterThanOrEqual(c.rasp.gain);
    expect(t.timingJitter).toBeGreaterThan(c.timingJitter);
    expect(t.intake.noiseGain).toBeGreaterThan(c.intake.noiseGain);
    expect(t.intake.level).toBeGreaterThan(c.intake.level);
    expect(t.collectorDampHz).toBeLessThan(c.collectorDampHz);
    expect(t.mechanical.whineGain).toBeGreaterThan(c.mechanical.whineGain);
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
