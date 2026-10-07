import { describe, expect, it } from 'vitest';
import { supportsTouchControls } from '@/input/touch-capability';

describe('touch control capability', () => {
  it('recognises a coarse WebKit pointer even without maxTouchPoints', () => {
    expect(supportsTouchControls(0, true)).toBe(true);
  });

  it('keeps controls available on hybrid touch computers', () => {
    expect(supportsTouchControls(5, false)).toBe(true);
  });

  it('does not show phone controls for a mouse', () => {
    expect(supportsTouchControls(0, false)).toBe(false);
  });
});
