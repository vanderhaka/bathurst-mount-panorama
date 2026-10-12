/**
 * Cooperative world building. The heavy builders are generators that `yield` at natural boundaries (a texture
 * row band, a terrain chunk, a placement column). `runSync` runs one straight through, so tests and tools keep a
 * plain call with the same output; `runCooperative` hands the thread back to the browser whenever a slice has run
 * long enough, so the loading bar moves and the page stays responsive. Nothing here reorders work, so the seeded
 * random streams, and therefore the geometry, are identical either way.
 */
export type Steps<T> = Generator<number | void, T, void>;

/** Runs the steps to the end without ever yielding to the browser. */
export function runSync<T>(steps: Steps<T>): T {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
  }
}

/** Report to the loading bar: a fraction 0..1 and a label. */
export type StageProgress = (fraction: number, label: string) => Promise<void> | void;

const SLICE_MS = 12;
/** Do not spam the loading screen: at most one report per this many ms. */
const REPORT_MS = 60;
/** A task break without the 4 ms minimum that nested setTimeout calls get, which would add seconds over a whole build. */
const channel = typeof MessageChannel === 'function' ? new MessageChannel() : null;
const waiting: Array<() => void> = [];
if (channel) channel.port1.onmessage = () => waiting.shift()?.();
const tick = (): Promise<void> => new Promise((resolve) => {
  if (!channel) { setTimeout(resolve, 0); return; }
  waiting.push(resolve);
  channel.port2.postMessage(0);
});

/** Longest slice seen by the last runs, for diagnostics (read from the console or a script). */
export const sliceStats = { longestMs: 0, slices: 0 };

/**
 * Runs the steps in slices of about 12 ms. A step may `yield` a fraction (0..1) of its own work to move the loading
 * bar between `from` and `to`; plain `yield` only marks a place where the thread may be handed back.
 */
export async function runCooperative<T>(
  steps: Steps<T>, progress: StageProgress | undefined, from: number, to: number, label: string,
): Promise<T> {
  let sliceStart = performance.now(), lastReport = -Infinity, fraction = 0;
  for (;;) {
    const r = steps.next();
    if (r.done) {
      sliceStats.longestMs = Math.max(sliceStats.longestMs, performance.now() - sliceStart);
      return r.value;
    }
    if (typeof r.value === 'number') fraction = r.value;
    const now = performance.now();
    if (now - sliceStart < SLICE_MS) continue;
    sliceStats.longestMs = Math.max(sliceStats.longestMs, now - sliceStart);
    sliceStats.slices++;
    if (progress && now - lastReport >= REPORT_MS) {
      lastReport = now;
      await progress(from + (to - from) * Math.min(1, Math.max(0, fraction)), label);
    } else await tick();
    sliceStart = performance.now();
  }
}

/** Maps the fractions a sub-build yields (0..1) onto the part [a, b] of its parent's own range. */
export function* scaled<T>(steps: Steps<T>, a: number, b: number): Steps<T> {
  for (;;) {
    const r = steps.next();
    if (r.done) return r.value;
    yield typeof r.value === 'number' ? a + (b - a) * r.value : undefined;
  }
}
