import { describe, expect, it } from 'vitest';
import { DynamicResolution, RENDER_SCALES } from '@/render/dynamic-resolution';

const BUDGET = 1 / 60;

/** Seconds of frames at a steady interval (and GPU time per frame, null without timer queries); returns scale changes. */
function feed(dr: DynamicResolution, seconds: number, interval: number, gpu: number | null = null): number[] {
  const changes: number[] = [];
  for (let i = 0, n = Math.round(seconds / interval); i < n; i++) {
    const scale = dr.sample(interval, gpu, BUDGET);
    if (scale !== null) changes.push(scale);
  }
  return changes;
}

describe('fast hardware keeps the full resolution', () => {
  it('never lowers the scale at 60 fps, with or without GPU timing', () => {
    const dr = new DynamicResolution();
    expect(feed(dr, 60, 1 / 60)).toEqual([]);
    expect(feed(dr, 60, 1 / 60, 0.006)).toEqual([]);
    expect(dr.scale).toBe(1);
    expect(dr.exhausted).toBe(false);
  });

  it('keeps full resolution while vsync-locked frames still make the budget with a busy GPU', () => {
    const dr = new DynamicResolution();
    expect(feed(dr, 30, 1 / 60, 0.015)).toEqual([]);
  });

  it('treats isolated hitches (compiles, GC) as no evidence', () => {
    const dr = new DynamicResolution();
    const changes: number[] = [];
    for (let s = 0; s < 20; s++) changes.push(...feed(dr, 1, 1 / 60), ...feed(dr, 0.3, 0.3));
    expect(changes).toEqual([]);
  });
});

describe('without GPU timer queries', () => {
  it('steps down one level per window after a cooldown and reports exhaustion only at the floor', () => {
    const dr = new DynamicResolution();
    expect(feed(dr, 1.4, 1 / 50)).toEqual([0.9]);
    expect(dr.exhausted).toBe(false);
    expect(feed(dr, 4, 1 / 50)).toEqual([0.8, 0.7]);
    expect(feed(dr, 2, 1 / 50)).toEqual([]);
    expect(dr.scale).toBe(RENDER_SCALES.at(-1));
    expect(dr.exhausted).toBe(true);
  });

  it('probes one step up after sustained on-budget frames and backs off when the probe misses', () => {
    const dr = new DynamicResolution();
    feed(dr, 2.9, 1 / 50);
    expect(dr.scale).toBe(0.8);
    // 1 s cooldown, then 4 s of on-budget windows.
    expect(feed(dr, 4.9, 1 / 60)).toEqual([0.9]);
    // The larger size misses: back down, and the next probe waits twice as long.
    expect(feed(dr, 1.6, 1 / 50)).toEqual([0.8]);
    expect(feed(dr, 6, 1 / 60)).toEqual([]);
    expect(feed(dr, 3.5, 1 / 60)).toEqual([0.9]);
  });
});

describe('with GPU timer queries', () => {
  it('sizes a fill-bound step from the GPU load instead of stepping one level at a time', () => {
    const dr = new DynamicResolution();
    // Missing frames with the GPU 30 % over budget: (0.8 / 1.3) ^ 0.5 = 0.78 of the size, so straight to 0.7.
    expect(feed(dr, 1.6, 1 / 45, BUDGET * 1.3)).toEqual([0.7]);
  });

  it('leaves the scale alone when frames are lost to CPU time, and lets the tier stepper act', () => {
    const dr = new DynamicResolution();
    expect(feed(dr, 10, 1 / 40, BUDGET * 0.4)).toEqual([]);
    expect(dr.scale).toBe(1);
    expect(dr.exhausted).toBe(true);
  });

  it('steps back up only with sustained headroom that the larger size is predicted to keep', () => {
    const dr = new DynamicResolution();
    feed(dr, 1.6, 1 / 45, BUDGET * 1.3);
    expect(dr.scale).toBe(0.7);
    // 70 % load at 0.7 would be 91 % at 0.8: stay.
    expect(feed(dr, 10, 1 / 60, BUDGET * 0.7)).toEqual([]);
    // 45 % load: 59 % at 0.8, after 1 s cooldown and 2 s of headroom.
    expect(feed(dr, 3.1, 1 / 60, BUDGET * 0.45)).toEqual([0.8]);
  });

  it('resets to full resolution for a new tier or the menus', () => {
    const dr = new DynamicResolution();
    feed(dr, 1.6, 1 / 45, BUDGET * 1.3);
    expect(dr.reset()).toBe(true);
    expect(dr.scale).toBe(1);
    expect(dr.reset()).toBe(false);
  });
});
