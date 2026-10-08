import { describe, expect, it } from 'vitest';
import { cabinLowpassHz, gearWhineHz, kerbRumbleHz, layerMix, squealGain, surfaceWeights, whineGain, windGain } from '@/audio/dsp/mix-maps';
import { synthImpact, synthNoise, synthPop, synthShiftCrack } from '@/audio/dsp/oneshot-synth';
import { OverrunPopper, type PopEvent } from '@/audio/dsp/overrun';
import { createRng } from '@/audio/dsp/rng';
import { findPeaks, magnitudeSpectrum, peakAbs, rmsDb, spectralCentroid } from '@/audio/dsp/spectrum';

const SR = 48000;

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
