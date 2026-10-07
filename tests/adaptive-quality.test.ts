import { describe, expect, it } from 'vitest';
import { AdaptiveQuality } from '@/game/adaptive-quality';
import type { QualityChoice } from '@/game/quality-store';

function run(q: AdaptiveQuality, count: number, seconds: number, cap: 0 | 30 | 60 | 120 = 0): QualityChoice[] {
  const changes: QualityChoice[] = [];
  for (let i = 0; i < count; i++) {
    const change = q.sample(seconds, cap);
    if (change) changes.push(change);
  }
  return changes;
}

function high(): AdaptiveQuality {
  const q = new AdaptiveQuality({ quality: 'high', pixelRatio: 2, automatic: true });
  q.startRace();
  return q;
}

describe('first ten seconds of observed race frames', () => {
  it('uses raw 100 ms frames and steps through tiers before pixel density', () => {
    expect(run(high(), 100, 0.1).map(({ quality, pixelRatio }) => [quality, pixelRatio])).toEqual([
      ['medium', 1.5], ['low', 1], ['low', 0.75], ['low', 0.5],
    ]);
  });

  it('ends on raw wall-clock time rather than the physics 50 ms clamp', () => {
    const q = high();
    run(q, 100, 0.1);
    q.setChoice({ quality: 'high', pixelRatio: 2, automatic: true });
    expect(run(q, 100, 0.1)).toEqual([]);
  });

  it('waits for a two-second sample and leaves a healthy 60 fps race alone', () => {
    const q = high();
    expect(run(q, 119, 1 / 60)).toEqual([]);
    expect(run(q, 481, 1 / 60)).toEqual([]);
  });

  it('stops at Medium when the observed frames meet that tier budget', () => {
    expect(run(high(), 500, 1 / 50).map((c) => c.quality)).toEqual(['medium']);
  });

  it('uses the plan\'s Medium 50 fps budget instead of accepting 45 fps', () => {
    const q = new AdaptiveQuality({ quality: 'medium', pixelRatio: 1.5, automatic: true });
    q.startRace();
    expect(run(q, 90, 1 / 45)[0]?.quality).toBe('low');
  });

  it('honours an intentional 30 fps limit, including small timer jitter', () => {
    const q = high();
    expect(run(q, 300, 1 / 30 * 1.02, 30)).toEqual([]);
  });

  it('still adapts genuinely slow hardware when the player selects 30 fps', () => {
    expect(run(high(), 30, 0.1, 30).map((c) => c.quality)).toEqual(['medium']);
  });

  it('never increases density when stepping tiers on a 1x display', () => {
    const q = new AdaptiveQuality({ quality: 'high', pixelRatio: 1, automatic: true });
    q.startRace();
    expect(run(q, 20, 0.1)[0]).toEqual({ quality: 'medium', pixelRatio: 1, automatic: true });
  });

  it('respects an explicit Settings override and restarts observation for a new race', () => {
    const q = high();
    q.setChoice({ quality: 'high', pixelRatio: 2, automatic: false });
    expect(run(q, 100, 0.1)).toEqual([]);
    q.setChoice({ quality: 'medium', pixelRatio: 1.5, automatic: true });
    q.startRace();
    expect(run(q, 20, 0.1)[0]?.quality).toBe('low');
  });

  it('ignores invalid and zero deltas instead of creating bogus frame budgets', () => {
    const q = high();
    for (const dt of [0, -1, NaN, Infinity]) expect(q.sample(dt, 0)).toBeNull();
    expect(run(q, 20, 0.1)[0]?.quality).toBe('medium');
  });
});
