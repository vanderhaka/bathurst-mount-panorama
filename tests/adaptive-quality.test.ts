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

/** Seconds of frames at a steady interval. */
function steady(q: AdaptiveQuality, seconds: number, interval: number, cap: 0 | 30 | 60 | 120 = 0): QualityChoice[] {
  return run(q, Math.round(seconds / interval), interval, cap);
}

function high(): AdaptiveQuality {
  const q = new AdaptiveQuality({ quality: 'high', pixelRatio: 2, automatic: true });
  q.startRace();
  return q;
}

const tiers = (changes: QualityChoice[]) => changes.map(({ quality, pixelRatio }) => [quality, pixelRatio]);

describe('start-up hitches are not frame-rate evidence', () => {
  it('keeps High through a 350 ms first frame, uniform 60 fps and a 3.5 s rebuild block', () => {
    const q = high();
    expect(run(q, 1, 0.35)).toEqual([]);
    expect(steady(q, 5, 1 / 60)).toEqual([]);
    expect(run(q, 1, 3.5)).toEqual([]);
    expect(steady(q, 25, 1 / 60)).toEqual([]);
  });

  it('a single 75 ms frame in the first window no longer steps 60 Hz hardware down', () => {
    const q = high();
    steady(q, 1.2, 1 / 60);
    expect(run(q, 1, 0.075)).toEqual([]);
    expect(steady(q, 20, 1 / 60)).toEqual([]);
  });

  it('ignores isolated hitches above 0.25 s throughout the race', () => {
    const q = high();
    const changes: QualityChoice[] = [];
    for (let s = 0; s < 20; s++) changes.push(...steady(q, 1, 1 / 60), ...run(q, 1, 0.3));
    expect(changes).toEqual([]);
  });

  it('ignores the first second of frames after a race start, restart, resume or quality change', () => {
    const q = high();
    // Counting the slow warm-up frames would complete two slow windows after 4 s.
    expect([...steady(q, 1, 0.2), ...steady(q, 3, 1 / 40)]).toEqual([]);
    expect(tiers(steady(q, 1, 1 / 40))).toEqual([['medium', 1.5]]);
    q.settle();
    expect([...steady(q, 1, 0.2), ...steady(q, 3, 1 / 40)]).toEqual([]);
    expect(tiers(steady(q, 1, 1 / 40))).toEqual([['low', 1]]);
  });
});

describe('sustained slow frames', () => {
  it('needs two consecutive over-budget windows for one step down', () => {
    const q = high();
    expect(steady(q, 1, 1 / 40)).toEqual([]); // warm-up
    expect(steady(q, 2, 1 / 40)).toEqual([]); // first window over budget
    expect(run(q, 79, 1 / 40)).toEqual([]);
    expect(tiers(run(q, 1, 1 / 40))).toEqual([['medium', 1.5]]);
  });

  it('forgets an over-budget window when the next one meets the budget', () => {
    const q = high();
    steady(q, 1, 1 / 40);
    expect([...steady(q, 2, 1 / 40), ...steady(q, 2, 1 / 60), ...steady(q, 2, 1 / 40)]).toEqual([]);
    expect(tiers(steady(q, 2, 1 / 40))).toEqual([['medium', 1.5]]);
  });

  it('steps at most one tier per two windows and stops after ten seconds of evidence', () => {
    expect(tiers(steady(high(), 30, 0.1))).toEqual([['medium', 1.5], ['low', 1]]);
  });

  it('continues through tiers and then pixel density over later races', () => {
    const q = high();
    const changes = [...steady(q, 12, 0.1)];
    for (let race = 0; race < 2; race++) { q.startRace(); changes.push(...steady(q, 12, 0.1)); }
    expect(tiers(changes)).toEqual([['medium', 1.5], ['low', 1], ['low', 0.75], ['low', 0.5]]);
  });

  it('adapts hardware too slow to produce a single steady frame (sustained hitches)', () => {
    const q = high();
    expect(steady(q, 2, 0.3)).toEqual([]);
    expect(tiers(steady(q, 3, 0.3))).toEqual([['medium', 1.5]]);
  });

  it('stops at Medium when the observed frames meet that tier budget', () => {
    expect(steady(high(), 10, 1 / 50).map((c) => c.quality)).toEqual(['medium']);
  });

  it('uses the plan\'s Medium 50 fps budget instead of accepting 45 fps', () => {
    const q = new AdaptiveQuality({ quality: 'medium', pixelRatio: 1.5, automatic: true });
    q.startRace();
    expect(steady(q, 6, 1 / 45)[0]?.quality).toBe('low');
  });

  it('honours an intentional 30 fps limit, including small timer jitter', () => {
    expect(steady(high(), 12, 1 / 30 * 1.02, 30)).toEqual([]);
  });

  it('still adapts genuinely slow hardware when the player selects 30 fps', () => {
    expect(steady(high(), 6, 0.1, 30).map((c) => c.quality)).toEqual(['medium']);
  });

  it('never increases density when stepping tiers on a 1x display', () => {
    const q = new AdaptiveQuality({ quality: 'high', pixelRatio: 1, automatic: true });
    q.startRace();
    expect(steady(q, 6, 0.1)[0]).toEqual({ quality: 'medium', pixelRatio: 1, automatic: true });
  });
});

describe('manual choices and observation limits', () => {
  it('never changes a manual choice, however slow the frames', () => {
    const q = high();
    q.setChoice({ quality: 'high', pixelRatio: 2, automatic: false });
    expect(steady(q, 30, 0.1)).toEqual([]);
    expect(steady(q, 30, 0.3)).toEqual([]);
    q.startRace();
    expect(steady(q, 30, 0.1)).toEqual([]);
  });

  it('respects an explicit Settings override and restarts observation for a new race', () => {
    const q = high();
    q.setChoice({ quality: 'high', pixelRatio: 2, automatic: false });
    expect(steady(q, 10, 0.1)).toEqual([]);
    q.setChoice({ quality: 'medium', pixelRatio: 1.5, automatic: true });
    q.startRace();
    expect(steady(q, 6, 0.1)[0]?.quality).toBe('low');
  });

  it('ends observation on raw wall-clock frames rather than the physics 50 ms clamp', () => {
    const q = high();
    steady(q, 30, 0.1);
    q.setChoice({ quality: 'high', pixelRatio: 2, automatic: true });
    expect(steady(q, 30, 0.1)).toEqual([]);
  });

  it('ignores invalid and zero deltas instead of creating bogus frame budgets', () => {
    const q = high();
    for (const dt of [0, -1, NaN, Infinity]) expect(q.sample(dt, 0)).toBeNull();
    expect(steady(q, 6, 0.1)[0]?.quality).toBe('medium');
  });
});
