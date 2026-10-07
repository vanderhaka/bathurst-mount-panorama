import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { defaultSetup, sanitiseSetup, setupRanges, SetupStore, stepSetup, type CarSetup } from '@/config/setup';
import { pressureGrip, setupSpec } from '@/physics/setup-forces';

const cars: CarKind[] = ['camaro', 'mustang', 'supra'];

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('safe per-car setup', () => {
  for (const car of cars) {
    it(`${car}: keeps the existing bias, bars and grip at its default`, () => {
      const spec = CAR_SPECS[car];
      const setup = defaultSetup(car);
      expect(setup).toEqual({ brakeBiasFront: spec.brakeBiasFront, frontArbNpm: 52000, rearArbNpm: 26000, frontPressureKpa: 150, rearPressureKpa: 150 });
      expect(pressureGrip(setup.frontPressureKpa)).toBe(1);
      expect(setupSpec(spec, setup)).toEqual(spec);
      expect(setup).not.toBe(defaultSetup(car));
    });

    it(`${car}: bounds every field and never accepts a non-finite value`, () => {
      const defaults = defaultSetup(car);
      const ranges = setupRanges(car);
      for (const key of Object.keys(defaults) as Array<keyof CarSetup>) {
        expect(sanitiseSetup(car, { [key]: -1e9 })[key]).toBe(ranges[key].min);
        expect(sanitiseSetup(car, { [key]: 1e9 })[key]).toBe(ranges[key].max);
        for (const bad of [NaN, Infinity, -Infinity, '1', null]) expect(sanitiseSetup(car, { [key]: bad })[key]).toBe(defaults[key]);
        let setup = defaults;
        for (let i = 0; i < 100; i++) setup = stepSetup(car, setup, key, 1);
        expect(setup[key]).toBe(ranges[key].max);
        for (let i = 0; i < 100; i++) setup = stepSetup(car, setup, key, -1);
        expect(setup[key]).toBe(ranges[key].min);
      }
      expect(ranges.brakeBiasFront.min).toBeGreaterThanOrEqual(0.5);
      expect(ranges.brakeBiasFront.max).toBeLessThanOrEqual(0.7);
      expect(ranges.frontPressureKpa.min).toBeGreaterThanOrEqual(117);
      expect(ranges.rearPressureKpa.min).toBeGreaterThanOrEqual(117);
      expect(sanitiseSetup(car, null)).toEqual(defaults);
      expect(sanitiseSetup(car, [])).toEqual(defaults);
    });
  }

  it('persists one independent setup per car, including a change and reset after reload', () => {
    const storage = new MemoryStorage();
    const before = JSON.stringify(CAR_SPECS);
    const a = new SetupStore(storage);
    a.set('camaro', { brakeBiasFront: 0.625, frontArbNpm: 62000 });
    a.set('mustang', { rearPressureKpa: 130 });
    const b = new SetupStore(storage);
    expect(b.get('camaro').brakeBiasFront).toBe(0.625);
    expect(b.get('camaro').frontArbNpm).toBe(62000);
    expect(b.get('mustang').rearPressureKpa).toBe(130);
    expect(b.get('supra')).toEqual(defaultSetup('supra'));
    b.reset('camaro');
    const c = new SetupStore(storage);
    expect(c.get('camaro')).toEqual(defaultSetup('camaro'));
    expect(c.get('mustang').rearPressureKpa).toBe(130);
    expect(JSON.stringify(CAR_SPECS)).toBe(before);
    expect(Object.isFrozen(c.get('camaro'))).toBe(true);
  });

  it('recovers malformed storage and keeps live settings when storage is unavailable', () => {
    const storage = new MemoryStorage();
    storage.setItem('bathurst.setup.v1.camaro', '{');
    storage.setItem('bathurst.setup.v1.mustang', JSON.stringify({ frontPressureKpa: 1, rearArbNpm: 'bad' }));
    const store = new SetupStore(storage);
    expect(store.get('camaro')).toEqual(defaultSetup('camaro'));
    expect(store.get('mustang').frontPressureKpa).toBe(120);
    expect(store.get('mustang').rearArbNpm).toBe(26000);
    const unavailable = new SetupStore({ getItem: () => { throw Error('denied'); }, setItem: () => { throw Error('full'); } });
    unavailable.set('supra', { brakeBiasFront: 0.61 });
    expect(unavailable.get('supra').brakeBiasFront).toBe(0.61);
  });

  it('moves brake bias by half a percent without drift or wrapping at the limits', () => {
    let setup = defaultSetup('camaro');
    for (let i = 0; i < 7; i++) setup = stepSetup('camaro', setup, 'brakeBiasFront', 1);
    expect(setup.brakeBiasFront).toBe(0.635);
    for (let i = 0; i < 7; i++) setup = stepSetup('camaro', setup, 'brakeBiasFront', -1);
    expect(setup.brakeBiasFront).toBe(0.6);
  });
});
