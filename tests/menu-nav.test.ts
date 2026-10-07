import { describe, expect, it } from 'vitest';
import { DEFAULT_HANDLING, MEASURED_HANDLING } from '@/config/handling';
import { FrameLimiter } from '@/game/frame-limiter';
import { handlingText, HANDLING_FIELDS, isDefaultHandling, stepHandling } from '@/ui/handling-model';
import { itemBeside } from '@/ui/screen';

/** Stand-in element with a layout box (node has no DOM layout). */
function box(left: number, top: number, width = 100, height = 40): HTMLElement {
  return { getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }) } as unknown as HTMLElement;
}

describe('sideways menu navigation', () => {
  it('moves to the nearest item on the same line, never to a row above or below', () => {
    const again = box(0, 500), car = box(120, 500), menu = box(240, 500), above = box(130, 400);
    const items = [above, again, car, menu];
    expect(itemBeside(items, again, 1)).toBe(car);
    expect(itemBeside(items, car, 1)).toBe(menu);
    expect(itemBeside(items, car, -1)).toBe(again);
    expect(itemBeside(items, menu, 1)).toBeNull();
    expect(itemBeside(items, above, 1)).toBeNull();
  });
});

describe('frame rate limit', () => {
  /** Frames run in one second of display ticks at `hz` with the limit `cap`. */
  function frames(hz: number, cap: number): number {
    const lim = new FrameLimiter();
    let n = 0;
    for (let k = 0; k < hz; k++) if (lim.ready((k * 1000) / hz, cap)) n++;
    return n;
  }

  it('gives an even cap on 60, 120 and 144 Hz displays', () => {
    expect(frames(120, 60)).toBeGreaterThanOrEqual(59);
    expect(frames(120, 60)).toBeLessThanOrEqual(61);
    expect(frames(144, 60)).toBeGreaterThanOrEqual(59);
    expect(frames(144, 60)).toBeLessThanOrEqual(61);
    expect(frames(60, 30)).toBeGreaterThanOrEqual(29);
    expect(frames(60, 30)).toBeLessThanOrEqual(31);
    expect(frames(144, 120)).toBeLessThanOrEqual(121);
  });

  it('runs every frame with no limit, and when the display is slower than the limit', () => {
    expect(frames(144, 0)).toBe(144);
    expect(frames(60, 120)).toBe(60);
  });
});

describe('handling tab model', () => {
  const field = (key: string) => HANDLING_FIELDS.find((f) => f.key === key)!;

  it('steps without float drift and stops at the range ends', () => {
    let h = { ...MEASURED_HANDLING };
    for (let i = 0; i < 8; i++) h = { ...h, slideGrip: stepHandling(h, field('slideGrip'), 1) };
    expect(h.slideGrip).toBe(0.75);
    for (let i = 0; i < 100; i++) h = { ...h, grip: stepHandling(h, field('grip'), 1) };
    expect(h.grip).toBe(1.4);
  });

  it('shows values with units and knows the default values', () => {
    expect(handlingText(field('grip'), 1.04)).toBe('1.04×');
    expect(handlingText(field('peakSlipDeg'), 6.3)).toBe('6.3°');
    expect(handlingText(field('steerSpeedDeg'), 149)).toBe('149°/s');
    expect(isDefaultHandling(field('slideGrip'), 0.89)).toBe(true);
    expect(isDefaultHandling(field('slideGrip'), 0.59)).toBe(false);
  });

  it('covers every handling value', () => {
    expect(new Set(HANDLING_FIELDS.map((f) => f.key))).toEqual(new Set(Object.keys(DEFAULT_HANDLING)));
  });
});
