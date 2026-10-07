import { describe, expect, it } from 'vitest';
import { TYRE_COMPOUNDS, TyreModel, tyreGrip } from '@/physics/tyre-state';
import type { TyreHeatInput } from '@/physics/tyre-heat';

const input: TyreHeatInput = {
  throttle: 0, brake: 0, steer: 0, gLat: 0, gLong: 0,
  wheels: [0, 1, 2, 3].map(() => ({ load: 3500, slip: 0.5 })),
};
function run(model: TyreModel, seconds: number, data: TyreHeatInput, speed = 50): void {
  for (let i = 0; i < seconds * 10; i++) model.advance(data, speed, 0.1);
}

describe('temperature and wear affect the friction limit', () => {
  it('keeps a fresh warm soft exactly equal to the current warm-car grip', () => {
    for (const temp of [85, 90, 95, 100, 105]) expect(tyreGrip('soft', temp, 0)).toBe(1);
    expect(tyreGrip('soft', 52, 0)).toBeLessThan(0.97);
    expect(tyreGrip('soft', 22, 0)).toBeLessThan(tyreGrip('soft', 52, 0));
    expect(tyreGrip('soft', 125, 0)).toBeLessThan(tyreGrip('soft', 110, 0));
  });

  it('has continuous cold/hot transitions, and tread loss reduces grip monotonically', () => {
    for (const compound of ['soft', 'hard'] as const) {
      const def = TYRE_COMPOUNDS[compound];
      expect(tyreGrip(compound, def.minC - 0.001, 0)).toBeCloseTo(tyreGrip(compound, def.minC, 0), 6);
      expect(tyreGrip(compound, def.maxC + 0.001, 0)).toBeCloseTo(tyreGrip(compound, def.maxC, 0), 6);
      const values = [0, 0.1, 0.3, 0.6, 1].map((wear) => tyreGrip(compound, 95, wear));
      for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1]);
      expect(values.at(-1)).toBeGreaterThan(0.5);
    }
  });

  it('gives hard tyres a different window and lower wear rate', () => {
    expect(TYRE_COMPOUNDS.hard.minC).toBeGreaterThan(TYRE_COMPOUNDS.soft.minC);
    expect(TYRE_COMPOUNDS.hard.maxC).toBeGreaterThan(TYRE_COMPOUNDS.soft.maxC);
    const soft = new TyreModel('soft', 95);
    const hard = new TyreModel('hard', 95);
    run(soft, 60, { ...input, gLat: 1.5 });
    run(hard, 60, { ...input, gLat: 1.5 });
    expect(hard.tyres[0].wear).toBeLessThan(soft.tyres[0].wear * 0.7);
  });

  it('braking heats the front pair, and sliding increases temperature and wear', () => {
    const brake = new TyreModel();
    run(brake, 20, { ...input, brake: 1, gLong: -1.8 });
    expect(brake.tyres[0].tempC).toBeGreaterThan(brake.tyres[2].tempC + 5);
    const clean = new TyreModel();
    const slide = new TyreModel();
    run(clean, 20, { ...input, throttle: 1, gLong: 0.7 });
    const wheels = input.wheels!.map((w, i) => ({ ...w, slip: i < 2 ? 0.5 : 1.4 }));
    run(slide, 20, { ...input, wheels, throttle: 1, gLong: 0.7 });
    expect(slide.tyres[2].tempC).toBeGreaterThan(clean.tyres[2].tempC + 5);
    expect(slide.tyres[2].wear).toBeGreaterThan(clean.tyres[2].wear);
    expect(slide.tyres[2].grip).toBe(tyreGrip('soft', slide.tyres[2].tempC, slide.tyres[2].wear));
  });

  it('cools in still air without wearing, stops when paused, and fitting tyres resets all four', () => {
    const model = new TyreModel('soft', 105, 0.2);
    const readings = model.tyres;
    run(model, 20, input, 0);
    expect(readings[0].tempC).toBeLessThan(105);
    expect(readings[0].wear).toBe(0.2);
    const before = readings.map((t) => ({ ...t }));
    model.advance({ ...input, gLat: 2 }, 60, 0);
    expect(readings).toEqual(before);
    model.fit('hard', 52, 0);
    expect(model.tyres).toBe(readings);
    for (const tyre of readings) expect(tyre).toEqual({ tempC: 52, wear: 0, grip: tyreGrip('hard', 52, 0) });
  });
});
