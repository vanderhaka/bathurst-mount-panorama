import type { CarKind } from '@/car/car-specs';
import { gainToDb } from '@/audio/dsp/math';
import { magnitudeSpectrum, peakAbs, rmsDb, spectralCentroid } from '@/audio/dsp/spectrum';
import { makeFrame, SELFTEST_SAMPLE_RATE } from '@/audio/harness/selftest-common';
import { createCarAudioDebug } from '@/audio/car-audio';
import { renderOffline } from '@/audio/offline-render';
import type { CarAudioFrame } from '@/types/audio';

/** Loudest-possible mix: WOT at the limiter, full slip on a kerb at speed, with an impact. */
export async function runWorstCase(kind: CarKind): Promise<{ peakDbfs: number; rmsDbfs: number; ok: boolean }> {
  const res = await renderOffline({
    kind,
    seconds: 2,
    sampleRate: SELFTEST_SAMPLE_RATE,
    masterVolume: 1.5,
    frame: makeFrame({
      rpm: 7400,
      load: 1,
      throttle: 1,
      speedKmh: 280,
      gear: 6,
      onLimiter: true,
      slip: 1,
      scrub: 1,
      surface: 'kerb',
      interior: 1,
    }),
    impacts: [{ t: 0.8, energy: 1 }],
  });
  const peakDbfs = gainToDb(peakAbs(res.samples));
  return { peakDbfs, rmsDbfs: rmsDb(res.samples, 4800), ok: peakDbfs < 0 && !res.samples.some((v) => Number.isNaN(v)) };
}

/** Normal fast-corner mix with every layer active: level sanity. */
export async function runFullMix(kind: CarKind): Promise<{ peakDbfs: number; rmsDbfs: number; ok: boolean }> {
  const res = await renderOffline({
    kind,
    seconds: 2,
    sampleRate: SELFTEST_SAMPLE_RATE,
    frame: makeFrame({ rpm: 5200, load: 1, throttle: 1, speedKmh: 150, gear: 4, slip: 0.6, interior: 0 }),
  });
  const peakDbfs = gainToDb(peakAbs(res.samples));
  const rms = rmsDb(res.samples, 24000);
  return { peakDbfs, rmsDbfs: rms, ok: peakDbfs < 0 && rms > -30 && rms < -8 };
}

export interface OverrunResult {
  /** Count of 10 ms windows >= 9 dB above the median window level during overrun. */
  popWindows: number;
  medianDb: number;
  centroidHz: number;
  ok: boolean;
}

/** Lift off at 6600 rpm and check the exhaust crackles (transient pops above the burble floor). */
export async function runOverrun(kind: CarKind): Promise<{ result: OverrunResult; samples: Float32Array }> {
  const lift = 0.6;
  const frameAt = (t: number): CarAudioFrame =>
    t < lift
      ? makeFrame({ rpm: 6600, load: 1, throttle: 1, speedKmh: 0, gear: 0 })
      : makeFrame({ rpm: Math.max(2500, 6600 - (t - lift) * 1800), load: 0.05, throttle: 0, speedKmh: 0, gear: 0 });
  const res = await renderOffline({
    kind,
    seconds: 3.4,
    sampleRate: SELFTEST_SAMPLE_RATE,
    frame: frameAt(0),
    frameAt,
    updateHz: 60,
  });
  const sr = res.sampleRate;
  const win = Math.round(0.01 * sr);
  const levels: number[] = [];
  for (let s = Math.round(0.7 * sr); s + win < res.samples.length; s += win) levels.push(rmsDb(res.samples, s, s + win));
  const sorted = [...levels].sort((a, b) => a - b);
  const medianDb = sorted[Math.floor(sorted.length / 2)];
  const popWindows = levels.filter((l) => l >= medianDb + 9).length;
  const spec = magnitudeSpectrum(res.samples, sr, Math.round(1.2 * sr), 65536);
  return {
    result: { popWindows, medianDb, centroidHz: spectralCentroid(spec, 40, 8000), ok: popWindows >= 3 },
    samples: res.samples,
  };
}

export interface EventResult {
  kind: CarKind;
  /** Loudest 10 ms window within 60 ms after a gear shift, over the mean level before (dB). */
  shiftRiseDb: number;
  /** Level rise (dB) of the 150 ms after a full impact over the 150 ms before. */
  impactRiseDb: number;
  /** Std-dev of 10 ms window levels (dB) on the limiter vs the same rpm off the limiter. */
  limiterStutterDb: number;
  baselineStutterDb: number;
  ok: boolean;
}

function windowDb(samples: Float32Array, sr: number, fromSec: number, durSec: number): number {
  const a = Math.round(fromSec * sr);
  return rmsDb(samples, a, a + Math.round(durSec * sr));
}

function levelStd(samples: Float32Array, sr: number, fromSec: number, toSec: number): number {
  const win = Math.round(0.01 * sr);
  const v: number[] = [];
  for (let s = Math.round(fromSec * sr); s + win < Math.round(toSec * sr); s += win) v.push(rmsDb(samples, s, s + win));
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) * (b - mean), 0) / v.length);
}

/** Shift crack, impact thump and limiter stutter are each audible against the steady engine. */
export async function runEvents(kind: CarKind): Promise<EventResult> {
  const sr = SELFTEST_SAMPLE_RATE;
  const base = makeFrame({ rpm: 4000, load: 0.6, throttle: 0.6, speedKmh: 0, gear: 3 });
  const shift = await renderOffline({
    kind,
    seconds: 2,
    sampleRate: sr,
    frame: base,
    frameAt: (t) => (Math.abs(t - 1) < 0.009 ? { ...base, gear: 4, shifted: true } : { ...base, gear: t > 1 ? 4 : 3 }),
    updateHz: 60,
  });
  const imp = await renderOffline({ kind, seconds: 2, sampleRate: sr, frame: base, impacts: [{ t: 1, energy: 1 }] });
  const lim = await renderOffline({
    kind,
    seconds: 2,
    sampleRate: sr,
    frame: makeFrame({ rpm: 7400, load: 1, throttle: 1, onLimiter: true, gear: 5 }),
  });
  const nolim = await renderOffline({
    kind,
    seconds: 2,
    sampleRate: sr,
    frame: makeFrame({ rpm: 7400, load: 1, throttle: 1, onLimiter: false, gear: 5 }),
  });
  let shiftPeak = -200;
  for (let w = 0; w < 6; w++) shiftPeak = Math.max(shiftPeak, windowDb(shift.samples, sr, 1.0 + w * 0.01, 0.01));
  const shiftRiseDb = shiftPeak - windowDb(shift.samples, sr, 0.85, 0.1);
  const impactRiseDb = windowDb(imp.samples, sr, 1.0, 0.15) - windowDb(imp.samples, sr, 0.8, 0.15);
  const limiterStutterDb = levelStd(lim.samples, sr, 0.5, 2);
  const baselineStutterDb = levelStd(nolim.samples, sr, 0.5, 2);
  return {
    kind,
    shiftRiseDb,
    impactRiseDb,
    limiterStutterDb,
    baselineStutterDb,
    ok: shiftRiseDb > 3 && impactRiseDb > 9 && limiterStutterDb > 2 && limiterStutterDb > baselineStutterDb * 2,
  };
}

/** API safety: calls before init and after dispose are harmless, dispose is idempotent. */
export async function runLifecycle(): Promise<{ ok: boolean; detail: string }> {
  const frame = makeFrame({ rpm: 4000, speedKmh: 120, gear: 3 });
  const audio = createCarAudioDebug('camaro', new OfflineAudioContext(2, 48000, 48000));
  try {
    audio.update(frame, 1 / 60);
    audio.impact(1);
    const readyBefore = audio.ready;
    await audio.init();
    const readyAfterInit = audio.ready;
    audio.setMasterVolume(0.5);
    audio.update({ ...frame, rpm: Number.NaN, speedKmh: -40 }, 0);
    audio.impact(Number.NaN);
    audio.suspend();
    audio.resume();
    audio.dispose();
    audio.update(frame, 1 / 60);
    audio.impact(1);
    audio.setMasterVolume(1);
    audio.dispose();
    const ok = !readyBefore && readyAfterInit && !audio.ready;
    return { ok, detail: `before=${readyBefore} afterInit=${readyAfterInit} afterDispose=${audio.ready}` };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}
