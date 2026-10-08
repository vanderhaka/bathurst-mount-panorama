import { describe, expect, it } from 'vitest';
import { tyreScrubGain, tyreScrubUse } from '@/audio/dsp/tyre-scrub';

describe('loaded tyre scrub', () => {
  it('uses measured combined tyre demand, ignores unloaded wheels and stays bounded', () => {
    const coast = tyreScrubUse([{ load: 4000, slip: 0.1 }, { load: 3000, slip: 0.1 }]);
    const corner = tyreScrubUse([{ load: 4000, slip: 0.8 }, { load: 3000, slip: 0.6 }]);
    expect(coast).toBe(0);
    expect(corner).toBeGreaterThan(0.4);
    expect(tyreScrubUse([{ load: 4000, slip: 0.1 }, { load: 0, slip: 20 }])).toBe(coast);
    expect(tyreScrubUse([{ load: 4000, slip: 20 }])).toBe(1);
    expect(tyreScrubUse([{ load: 0, slip: 20 }])).toBe(0);
    expect(tyreScrubUse([{ load: Number.NaN, slip: Number.NaN }])).toBe(0);
  });

  it('produces scrub before a full slide, needs movement and fades on coast', () => {
    expect(tyreScrubGain(0.5, 120)).toBeGreaterThan(0.05);
    expect(tyreScrubGain(1, 0)).toBe(0);
    expect(tyreScrubGain(0, 120)).toBe(0);
    expect(tyreScrubGain(0.5, 120)).toBeGreaterThan(tyreScrubGain(0.5, 10));
    expect(tyreScrubGain(100, 1000)).toBeLessThanOrEqual(0.32);
    expect(tyreScrubGain(Number.NaN, Number.NaN)).toBe(0);
  });
});
