import type { CarKind } from '@/car/car-specs';
import { firingFrequencyHz } from '@/audio/dsp/firing';
import { layerMix } from '@/audio/dsp/mix-maps';
import {
  bandDistanceDb,
  findPeaks,
  levelNear,
  magnitudeSpectrum,
  peakAbs,
  rmsDb,
  spectralCentroid,
  thirdOctaveDb,
  type Spectrum,
} from '@/audio/dsp/spectrum';
import { gainToDb } from '@/audio/dsp/math';
import { renderOffline, type OfflineResult } from '@/audio/offline-render';
import { makeFrame, SELFTEST_SAMPLE_RATE } from '@/audio/harness/selftest-common';
import {
  runEvents,
  runFullMix,
  runLifecycle,
  runOverrun,
  runWorstCase,
  type EventResult,
  type OverrunResult,
} from '@/audio/harness/selftest-events';

export { makeFrame, SELFTEST_SAMPLE_RATE };
const SKIP_SECONDS = 0.5;
const CARS: readonly CarKind[] = ['camaro', 'mustang'];

export interface FixedRpmResult {
  kind: CarKind;
  /** Engine that actually produced the render (the worklet unless it failed to load). */
  engineMode: string;
  rpm: number;
  load: number;
  fireHz: number;
  dominantHz: number;
  dominantDb: number;
  /** Which expected component the dominant peak sits on, or null. */
  matches: 'firing' | 'half-order' | 'quarter-order' | null;
  matchErrPct: number;
  fireDb: number;
  halfOrderDb: number;
  peakDbfs: number;
  rmsDbfs: number;
  centroidHz: number;
  nan: boolean;
  ok: boolean;
}

export interface FixedRpmRun extends FixedRpmResult {
  spectrum: Spectrum;
  samples: Float32Array;
}

function analyse(res: OfflineResult, kind: CarKind, rpm: number, load: number): FixedRpmRun {
  const sr = res.sampleRate;
  const start = Math.round(SKIP_SECONDS * sr);
  const spectrum = magnitudeSpectrum(res.samples, sr, start, 65536);
  const fireHz = firingFrequencyHz(rpm);
  const top = findPeaks(spectrum, 25, fireHz * 1.25, 6)[0] ?? { hz: 0, db: -200 };
  const candidates = [
    { name: 'firing' as const, hz: fireHz },
    { name: 'half-order' as const, hz: fireHz / 2 },
    { name: 'quarter-order' as const, hz: fireHz / 4 },
  ];
  let best = { name: null as FixedRpmResult['matches'], err: 100 };
  for (const c of candidates) {
    const err = (Math.abs(top.hz - c.hz) / c.hz) * 100;
    if (err < best.err) best = { name: c.name, err };
  }
  const peakDbfs = gainToDb(peakAbs(res.samples));
  const rmsDbfs = rmsDb(res.samples, start);
  const nan = res.samples.some((v) => Number.isNaN(v));
  const fireDb = levelNear(spectrum, fireHz, 3);
  const matches = best.err <= 5 ? best.name : null;
  return {
    kind,
    engineMode: res.engineMode,
    rpm,
    load,
    fireHz,
    dominantHz: top.hz,
    dominantDb: top.db,
    matches,
    matchErrPct: best.err,
    fireDb,
    halfOrderDb: levelNear(spectrum, fireHz / 2, 3),
    peakDbfs,
    rmsDbfs,
    centroidHz: spectralCentroid(spectrum, 40, 8000),
    nan,
    ok: matches !== null && fireDb >= top.db - 12 && peakDbfs < 0 && rmsDbfs > -32 && rmsDbfs < -8 && !nan,
    spectrum,
    samples: res.samples,
  };
}

/** Engine-only steady-state render (no speed, so wind/tyre/surface layers stay silent). */
export async function runFixedRpm(
  kind: CarKind,
  rpm: number,
  load: number,
  opts: { forceFallback?: boolean; seconds?: number } = {},
): Promise<FixedRpmRun> {
  const res = await renderOffline({
    kind,
    seconds: opts.seconds ?? 2,
    sampleRate: SELFTEST_SAMPLE_RATE,
    forceFallback: opts.forceFallback,
    frame: makeFrame({ rpm, load, throttle: load > 0.5 ? 1 : 0, gear: 0 }),
  });
  return analyse(res, kind, rpm, load);
}

export interface SelfTestReport {
  engineMode: string;
  workletError?: string;
  runs: FixedRpmResult[];
  fallback: FixedRpmResult | null;
  comparison: { bandDistanceDb: number; centroidCamaro: number; centroidMustang: number; centroidRatio: number; differ: boolean };
  pitchTracking: Array<{ kind: CarKind; ratioFire: number; expected: number; ok: boolean }>;
  brightness: Array<{ kind: CarKind; throttleCentroid: number; overrunCentroid: number; ok: boolean }>;
  levels: Array<{ kind: CarKind; fullMix: { peakDbfs: number; rmsDbfs: number; ok: boolean }; worst: { peakDbfs: number; rmsDbfs: number; ok: boolean } }>;
  overrun: Array<{ kind: CarKind } & OverrunResult>;
  events: EventResult[];
  interiorMix: { intakeOverExhaust: number; ok: boolean };
  lifecycle: { ok: boolean; detail: string };
  pass: boolean;
}

export interface SelfTestArtifacts {
  report: SelfTestReport;
  spectra: Array<{ kind: CarKind; rpm: number; spectrum: Spectrum }>;
  overrunSamples: Float32Array | null;
}

function strip(run: FixedRpmRun): FixedRpmResult {
  const { spectrum: _s, samples: _x, ...rest } = run;
  void _s;
  void _x;
  return rest;
}

export async function runSelfTest(): Promise<SelfTestArtifacts> {
  const runs: FixedRpmRun[] = [];
  for (const kind of CARS) {
    for (const rpm of [3000, 4500]) runs.push(await runFixedRpm(kind, rpm, 1));
  }
  const at = (k: CarKind, rpm: number): FixedRpmRun => runs.find((r) => r.kind === k && r.rpm === rpm) as FixedRpmRun;

  const bands = CARS.map((k) => thirdOctaveDb(at(k, 4500).spectrum));
  const centroidCamaro = at('camaro', 4500).centroidHz;
  const centroidMustang = at('mustang', 4500).centroidHz;
  const dist = bandDistanceDb(bands[0], bands[1]);
  const ratio = Math.max(centroidCamaro, centroidMustang) / Math.min(centroidCamaro, centroidMustang);

  const pitchTracking = CARS.map((kind) => {
    const hz = (r: FixedRpmRun): number => findPeaks(r.spectrum, r.fireHz * 0.95, r.fireHz * 1.05, 1)[0]?.hz ?? 0;
    const ratioFire = hz(at(kind, 4500)) / Math.max(1, hz(at(kind, 3000)));
    return { kind, ratioFire, expected: 1.5, ok: Math.abs(ratioFire - 1.5) / 1.5 < 0.02 };
  });

  const brightness = [];
  for (const kind of CARS) {
    const over = await runFixedRpm(kind, 4500, 0.05);
    const thr = at(kind, 4500).centroidHz;
    brightness.push({ kind, throttleCentroid: thr, overrunCentroid: over.centroidHz, ok: thr > over.centroidHz });
  }

  const levels = [];
  const overrun = [];
  const events: EventResult[] = [];
  let overrunSamples: Float32Array | null = null;
  for (const kind of CARS) {
    levels.push({ kind, fullMix: await runFullMix(kind), worst: await runWorstCase(kind) });
    const o = await runOverrun(kind);
    overrun.push({ kind, ...o.result });
    if (kind === 'camaro') overrunSamples = o.samples;
    events.push(await runEvents(kind));
  }

  const fallbackRun = await runFixedRpm('camaro', 3000, 1, { forceFallback: true });
  const mix = layerMix(1);
  const interiorMix = { intakeOverExhaust: mix.intake / mix.exhaust, ok: mix.intake > mix.exhaust };

  const report: SelfTestReport = {
    engineMode: runs[0].engineMode,
    workletError: runs.find((r) => r.engineMode !== 'worklet') ? 'worklet engine not used for some runs' : undefined,
    runs: runs.map(strip),
    fallback: strip(fallbackRun),
    comparison: {
      bandDistanceDb: dist,
      centroidCamaro,
      centroidMustang,
      centroidRatio: ratio,
      differ: dist >= 3 && ratio >= 1.1,
    },
    pitchTracking,
    brightness,
    levels,
    overrun,
    events,
    interiorMix,
    lifecycle: await runLifecycle(),
    pass: false,
  };
  report.pass =
    runs.every((r) => r.ok && r.engineMode === 'worklet') &&
    fallbackRun.engineMode === 'fallback' &&
    report.comparison.differ &&
    pitchTracking.every((p) => p.ok) &&
    brightness.every((b) => b.ok) &&
    levels.every((l) => l.fullMix.ok && l.worst.ok) &&
    overrun.every((o) => o.ok) &&
    events.every((e) => e.ok) &&
    interiorMix.ok &&
    report.lifecycle.ok &&
    fallbackRun.ok;
  return {
    report,
    spectra: runs.map((r) => ({ kind: r.kind, rpm: r.rpm, spectrum: r.spectrum })),
    overrunSamples,
  };
}
