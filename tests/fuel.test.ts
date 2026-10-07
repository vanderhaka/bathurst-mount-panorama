import { describe, expect, it } from 'vitest';
import { FuelModel, FUEL_CAPACITY_L, FUEL_REFERENCE_L, fuelMassKg } from '@/physics/fuel';

function run(fuel: FuelModel, seconds: number, throttle: number): void {
  for (let i = 0; i < seconds * 10; i++) fuel.advance(throttle, 0.1);
}

describe('fuel in the physics', () => {
  it('adds 0.75 kg per litre and keeps the calibrated 1400 kg car at its reference load', () => {
    expect(fuelMassKg(132)).toBe(99);
    expect(fuelMassKg(15)).toBe(11.25);
    const fuel = new FuelModel();
    expect(fuel.massKg(1400)).toBe(1400);
    fuel.reset(132);
    expect(fuel.massKg(1400)).toBe(1439);
    fuel.reset(0);
    expect(fuel.massKg(1400)).toBe(1340);
    expect(FUEL_REFERENCE_L).toBe(80);
  });

  it('burns around four litres in a Bathurst lap, with lower use when coasting', () => {
    const loaded = new FuelModel();
    const idle = new FuelModel();
    run(loaded, 125, 0.65);
    run(idle, 125, 0);
    expect(FUEL_REFERENCE_L - loaded.litres).toBeCloseTo(4.0125, 5);
    expect(FUEL_REFERENCE_L - idle.litres).toBeCloseTo(0.275, 5);
    expect(loaded.massKg(1400)).toBeLessThan(1400);
  });

  it('counts complete laps, excludes a short run-in, and holds laps-left until the line', () => {
    const fuel = new FuelModel();
    run(fuel, 20, 1);
    fuel.crossLine();
    expect(fuel.lapsLeft).toBeNull();
    run(fuel, 125, 0.65);
    fuel.crossLine();
    expect(fuel.lapsLeft).toBeCloseTo(fuel.litres / 4.0125, 5);
    const first = fuel.lapsLeft;
    run(fuel, 80, 1);
    expect(fuel.lapsLeft).toBe(first);
    run(fuel, 45, 0);
    fuel.crossLine();
    expect(fuel.lapsLeft).not.toBe(first);
  });

  it('never creates negative fuel, ignores invalid time, and resets the fuel average', () => {
    const fuel = new FuelModel();
    fuel.reset(0.02);
    run(fuel, 2, 1);
    expect(fuel.litres).toBe(0);
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) fuel.advance(1, dt);
    expect(fuel.litres).toBe(0);
    fuel.reset(1000);
    expect(fuel.litres).toBe(FUEL_CAPACITY_L);
    fuel.reset();
    expect(fuel.litres).toBe(FUEL_REFERENCE_L);
    expect(fuel.lapsLeft).toBeNull();
  });
});
