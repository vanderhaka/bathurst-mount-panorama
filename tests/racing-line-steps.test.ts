import { describe, expect, it } from 'vitest';
import { computeRacingLine, racingLineSteps } from '@/track/racing-line';
import { Track } from '@/track/track-model';

describe('racing line in steps', () => {
  it('gives the same line as the single call, and reports its fraction done up to 1', () => {
    const track = new Track();
    const steps = racingLineSteps(track);
    const fractions: number[] = [];
    let r = steps.next();
    while (!r.done) { if (typeof r.value === 'number') fractions.push(r.value); r = steps.next(); }
    const line = computeRacingLine(track);
    expect(Array.from(r.value.offset)).toEqual(Array.from(line.offset));
    expect(Array.from(r.value.curvature)).toEqual(Array.from(line.curvature));
    // Many small steps (the solve is about 200 ms at Bathurst), so each slice can hand back the thread.
    expect(fractions.length).toBeGreaterThan(1000);
    expect(fractions.every((f, i) => i === 0 || f > fractions[i - 1])).toBe(true);
    expect(fractions.at(-1)).toBe(1);
  });
});
