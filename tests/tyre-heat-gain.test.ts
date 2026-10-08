import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { TyreModel } from '@/physics/tyre-state';

const input = { throttle: 0.8, brake: 0, steer: 0.4, gLat: 1.2, gLong: 0.3 };

function run(gain?: number): TyreModel {
  const m = new TyreModel('soft');
  m.heatGain = gain;
  for (let i = 0; i < 360 * 20; i++) m.advance(input, 40, 1 / 360);
  return m;
}

describe('tyre heat gain', () => {
  it('raises temperature with the same input but leaves wear unscaled', () => {
    const base = run();
    const gained = run(1.5);
    for (let i = 0; i < 4; i++) {
      expect(gained.tyres[i].tempC).toBeGreaterThan(base.tyres[i].tempC);
      expect(gained.tyres[i].wear).toBe(base.tyres[i].wear);
    }
  });

  it('treats an explicit gain of 1 as no gain', () => {
    const base = run();
    const one = run(1);
    for (let i = 0; i < 4; i++) expect(one.tyres[i].tempC).toBe(base.tyres[i].tempC);
  });

  it('is absent on the three Gen3 cars', () => {
    for (const kind of ['camaro', 'mustang', 'supra'] as const) expect(CAR_SPECS[kind].tyreHeatGain).toBeUndefined();
  });
});
