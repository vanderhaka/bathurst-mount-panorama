import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWarmupStart, saveWarmupStart } from '@/shootout/warmup-start';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('warm-up start choice', () => {
  it('is the grid by default', () => {
    expect(loadWarmupStart('shootoutTop10')).toBe('grid');
    expect(loadWarmupStart('shootoutArcade')).toBe('grid');
  });

  it('remembers the rolling start and switches back', () => {
    saveWarmupStart('shootoutArcade', 'rolling');
    expect(loadWarmupStart('shootoutArcade')).toBe('rolling');
    saveWarmupStart('shootoutArcade', 'grid');
    expect(loadWarmupStart('shootoutArcade')).toBe('grid');
  });

  it('keeps the modes independent', () => {
    saveWarmupStart('shootoutArcade', 'rolling');
    expect(loadWarmupStart('shootoutTop10')).toBe('grid');
  });

  it('ignores the old v1 key, whose default was rolling', () => {
    mem.set('bathurst.shootout.warmupStart.v1.shootoutTop10', JSON.stringify({ unlocked: true, start: 'rolling' }));
    expect(loadWarmupStart('shootoutTop10')).toBe('grid');
  });

  it('falls back to the grid on corrupt data', () => {
    for (const bad of ['{nope', 'null', '42', 'sideways']) {
      mem.set('bathurst.shootout.warmupStart.v2.shootoutTop10', bad);
      expect(loadWarmupStart('shootoutTop10')).toBe('grid');
    }
  });

  it('never throws when storage does', () => {
    const boom = () => { throw new Error('blocked'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
    expect(loadWarmupStart('shootoutTop10')).toBe('grid');
    expect(() => saveWarmupStart('shootoutTop10', 'rolling')).not.toThrow();
  });
});
