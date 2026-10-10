import { describe, expect, it } from 'vitest';
import { GpuTimer } from '@/render/gpu-timer';

/** Minimal WebGL2 stand-in: queries finish when `finish()` is called, with the given nanoseconds. */
function fakeGl(withExtension = true) {
  const ext = { TIME_ELAPSED_EXT: 1, GPU_DISJOINT_EXT: 2 };
  const queries: { done: boolean; ns: number; deleted: boolean }[] = [];
  let active: object | null = null, disjoint = false;
  const gl = {
    QUERY_RESULT_AVAILABLE: 10, QUERY_RESULT: 11,
    getExtension: () => withExtension ? ext : null,
    createQuery: () => { const q = { done: false, ns: 0, deleted: false }; queries.push(q); return q; },
    beginQuery: (_t: number, q: object) => { expect(active).toBeNull(); active = q; },
    endQuery: () => { active = null; },
    deleteQuery: (q: { deleted: boolean }) => { q.deleted = true; },
    getParameter: (p: number) => p === ext.GPU_DISJOINT_EXT && disjoint,
    getQueryParameter: (q: { done: boolean; ns: number }, p: number) => p === 10 ? q.done : q.ns,
  };
  return {
    gl: gl as unknown as WebGL2RenderingContext, queries,
    finish: (ns: number) => { for (const q of queries) if (!q.done) { q.done = true; q.ns = ns; } },
    setDisjoint: (v: boolean) => { disjoint = v; },
  };
}

describe('GPU frame timing', () => {
  it('reports the newest finished frame once, in seconds, and frees its queries', () => {
    const f = fakeGl(), timer = new GpuTimer(f.gl);
    timer.begin(); timer.end();
    expect(timer.poll()).toBeNull();
    timer.begin(); timer.end();
    f.finish(8e6);
    expect(timer.poll()).toBeCloseTo(0.008);
    expect(timer.poll()).toBeNull();
    expect(f.queries.every(q => q.deleted)).toBe(true);
  });

  it('never piles up queries on a stalled GPU', () => {
    const f = fakeGl(), timer = new GpuTimer(f.gl);
    for (let i = 0; i < 20; i++) { timer.begin(); timer.end(); timer.poll(); }
    expect(f.queries.length).toBeLessThanOrEqual(4);
  });

  it('discards results across a disjoint event', () => {
    const f = fakeGl(), timer = new GpuTimer(f.gl);
    timer.begin(); timer.end();
    f.finish(5e6); f.setDisjoint(true);
    expect(timer.poll()).toBeNull();
    expect(f.queries.every(q => q.deleted)).toBe(true);
  });

  it('does nothing without the extension', () => {
    const f = fakeGl(false), timer = new GpuTimer(f.gl);
    timer.begin(); timer.end();
    expect(timer.poll()).toBeNull();
    expect(f.queries).toHaveLength(0);
  });
});
