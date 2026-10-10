import { describe, expect, it } from 'vitest';
import { synthBeep } from '@/audio/dsp/oneshot-synth';
import { findPeaks, magnitudeSpectrum, peakAbs } from '@/audio/dsp/spectrum';
import { startBeepFor } from '@/game/race-controller';

const SR = 48000;

describe('startBeepFor', () => {
  it('beeps once per light as the five lights come on', () => {
    const lights = [0, 0, 1, 1, 2, 3, 4, 5, 5];
    const beeps = lights.slice(1).map((now, i) => startBeepFor(lights[i], now)).filter(Boolean);
    expect(beeps).toEqual(['light', 'light', 'light', 'light', 'light']);
  });

  it('gives the go beep at lights out', () => {
    expect(startBeepFor(5, -1)).toBe('go');
  });

  it('stays silent for a rolling start and for a new grid start', () => {
    expect(startBeepFor(-1, -1)).toBeNull();
    expect(startBeepFor(0, -1)).toBeNull();
    // Back to the grid from a run: lights go from out (-1) to armed (0).
    expect(startBeepFor(-1, 0)).toBeNull();
    expect(startBeepFor(3, 0)).toBeNull();
  });
});

describe('synthBeep', () => {
  it('is a clean tone at the requested pitch that starts and ends at silence', () => {
    const beep = synthBeep(SR, 880, 0.14);
    expect(beep.length).toBe(Math.floor(0.14 * SR));
    expect(peakAbs(beep)).toBeLessThanOrEqual(0.8);
    expect(peakAbs(beep)).toBeGreaterThan(0.5);
    expect(Math.abs(beep[0])).toBeLessThan(1e-3);
    expect(Math.abs(beep[beep.length - 1])).toBeLessThan(0.01);
    const [peak] = findPeaks(magnitudeSpectrum(beep, SR, 0, 8192), 100, 5000, 1);
    expect(peak.hz).toBeGreaterThan(840);
    expect(peak.hz).toBeLessThan(920);
  });
});
