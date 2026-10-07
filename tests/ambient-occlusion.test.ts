import { describe, expect, it } from 'vitest';
import { horizonVisibility, contactVisibility } from '@/art/ambient-occlusion';

describe('baked ambient visibility', () => {
  it('leaves an open flat field lit, and darkens a sheltered valley', () => {
    expect(horizonVisibility(0, [0, 0, 0, 0], 6)).toBe(1);
    const valley = horizonVisibility(0, [4, 3, 5, 4], 6);
    expect(valley).toBeLessThan(0.85);
    expect(valley).toBeGreaterThanOrEqual(0.55);
    expect(horizonVisibility(5, [0, 1, 0, 1], 6)).toBe(1);
  });
  it('keeps contact darkening local, continuous and bounded', () => {
    expect(contactVisibility(0, 3)).toBeCloseTo(0.72);
    expect(contactVisibility(3, 3)).toBe(1);
    expect(contactVisibility(10, 3)).toBe(1);
    expect(contactVisibility(1, 3)).toBeLessThan(contactVisibility(2, 3));
    expect(contactVisibility(0, 0)).toBe(1);
  });
});
