import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWarmupStart, saveWarmupStart, unlockWarmupChoice, warmupChoiceUnlocked } from '@/shootout/warmup-start';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('warm-up start choice', () => {
  it('is locked and rolling by default', () => {
    expect(warmupChoiceUnlocked('shootoutTop10')).toBe(false);
    expect(loadWarmupStart('shootoutTop10')).toBe('rolling');
  });

  it('remembers grid once unlocked', () => {
    unlockWarmupChoice('shootoutArcade');
    expect(warmupChoiceUnlocked('shootoutArcade')).toBe(true);
    expect(loadWarmupStart('shootoutArcade')).toBe('rolling');
    saveWarmupStart('shootoutArcade', 'grid');
    expect(loadWarmupStart('shootoutArcade')).toBe('grid');
    unlockWarmupChoice('shootoutArcade');
    expect(loadWarmupStart('shootoutArcade')).toBe('grid');
  });

  it('keeps the modes independent', () => {
    unlockWarmupChoice('shootoutArcade');
    saveWarmupStart('shootoutArcade', 'grid');
    expect(warmupChoiceUnlocked('shootoutTop10')).toBe(false);
    expect(loadWarmupStart('shootoutTop10')).toBe('rolling');
  });

  it('reports rolling while locked even if grid was stored', () => {
    saveWarmupStart('shootoutTop10', 'grid');
    expect(loadWarmupStart('shootoutTop10')).toBe('rolling');
    unlockWarmupChoice('shootoutTop10');
    expect(loadWarmupStart('shootoutTop10')).toBe('grid');
  });

  it('falls back to the defaults on corrupt data', () => {
    for (const bad of ['{nope', 'null', '42', '{"unlocked":"yes","start":"sideways"}']) {
      mem.set('bathurst.shootout.warmupStart.v1.shootoutTop10', bad);
      expect(warmupChoiceUnlocked('shootoutTop10')).toBe(false);
      expect(loadWarmupStart('shootoutTop10')).toBe('rolling');
    }
  });

  it('never throws when storage does', () => {
    const boom = () => { throw new Error('blocked'); };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom });
    expect(warmupChoiceUnlocked('shootoutTop10')).toBe(false);
    expect(loadWarmupStart('shootoutTop10')).toBe('rolling');
    expect(() => { unlockWarmupChoice('shootoutTop10'); saveWarmupStart('shootoutTop10', 'grid'); }).not.toThrow();
  });
});
