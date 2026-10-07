import type { CarKind } from '@/car/car-specs';
import { createCarAudioDebug, type EngineMode } from '@/audio/car-audio';
import type { CarAudioFrame } from '@/types/audio';

export interface OfflineScenario {
  kind: CarKind;
  seconds: number;
  /** Static frame, held for the whole render. */
  frame: CarAudioFrame;
  /** Optional timeline: called at `updateHz` to drive update() like the game loop does. */
  frameAt?: (t: number) => CarAudioFrame;
  updateHz?: number;
  /** Collisions to trigger at given times. */
  impacts?: ReadonlyArray<{ t: number; energy: number }>;
  sampleRate?: number;
  forceFallback?: boolean;
  masterVolume?: number;
}

export interface OfflineResult {
  samples: Float32Array;
  sampleRate: number;
  engineMode: EngineMode;
  workletError: string | undefined;
}

const QUANTUM = 128;

/** Group timed actions onto render-quantum boundaries (suspend() requires distinct, aligned times). */
function groupByQuantum(
  marks: Array<{ t: number; run: () => void }>,
  sr: number,
  length: number,
): Array<{ t: number; runs: Array<() => void> }> {
  const groups = new Map<number, Array<() => void>>();
  for (const m of marks) {
    const q = Math.max(1, Math.round((m.t * sr) / QUANTUM)) * QUANTUM;
    if (q >= length) continue;
    const list = groups.get(q) ?? [];
    list.push(m.run);
    groups.set(q, list);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([q, runs]) => ({ t: q / sr, runs }));
}

/** Render the full car-audio graph (worklet or fallback engine, all layers, master bus) offline. */
export async function renderOffline(s: OfflineScenario): Promise<OfflineResult> {
  const sr = s.sampleRate ?? 48000;
  const length = Math.round(s.seconds * sr);
  const ctx = new OfflineAudioContext(2, length, sr);
  const audio = createCarAudioDebug(s.kind, ctx, { forceFallback: s.forceFallback });
  await audio.init();
  if (s.masterVolume !== undefined) audio.setMasterVolume(s.masterVolume);
  const frameAt = s.frameAt;
  audio.snap(frameAt ? frameAt(0) : s.frame);

  const marks: Array<{ t: number; run: () => void }> = [];
  if (frameAt && s.updateHz) {
    const dt = 1 / s.updateHz;
    for (let t = dt; t < s.seconds; t += dt) marks.push({ t, run: () => audio.update(frameAt(t), dt) });
  }
  for (const i of s.impacts ?? []) marks.push({ t: i.t, run: () => audio.impact(i.energy) });
  for (const g of groupByQuantum(marks, sr, length)) {
    void ctx.suspend(g.t).then(() => {
      for (const run of g.runs) run();
      return ctx.resume();
    });
  }
  const buffer = await ctx.startRendering();
  const result: OfflineResult = {
    samples: buffer.getChannelData(0).slice(),
    sampleRate: sr,
    engineMode: audio.engineMode,
    workletError: audio.workletError,
  };
  audio.dispose();
  return result;
}
