import { clamp01, smoothstep } from '@/audio/dsp/math';

const finite = (value: number): number => Number.isFinite(value) ? value : 0;

/** Load-weighted combined tyre demand: unloaded wheels cannot create a scrub sound. */
export function tyreScrubUse(wheels: ReadonlyArray<{ load: number; slip: number }>): number {
  let demand = 0, totalLoad = 0;
  for (const wheel of wheels) {
    const load = Math.max(0, finite(wheel.load));
    demand += load * clamp01(finite(wheel.slip));
    totalLoad += load;
  }
  return totalLoad > 0 ? smoothstep(0.3, 0.9, demand / totalLoad) : 0;
}

/** Broad rubber noise comes in before a full slide and vanishes when stationary. */
export function tyreScrubGain(scrub: number, speedKmh: number): number {
  return 0.32 * clamp01(finite(scrub)) * smoothstep(5, 45, Math.abs(finite(speedKmh)));
}
