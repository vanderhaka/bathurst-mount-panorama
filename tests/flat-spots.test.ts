import { expect, it } from 'vitest';
import { FlatSpots, flatSpotGrip, flatSpotVibration } from '@/physics/flat-spots';

it('requires sustained longitudinal lock demand, road load and speed, rather than a generic slide', () => {
  const spots = new FlatSpots();
  for (const [lock, speed, load, surface] of [
    [0, 80, 4000, 'road'], [1.05, 80, 4000, 'road'], [2, 4, 4000, 'road'], [2, 80, 0, 'road'], [2, 80, 4000, 'grass'],
  ] as const) spots.advance(0, lock, speed, load, surface, 1);
  expect(spots.tyres[0].severity).toBe(0);
  spots.advance(0, 1.8, 80, 4000, 'road', 0.08); expect(spots.tyres[0].severity).toBe(0);
  spots.advance(0, 0, 80, 4000, 'road', 0.01);
  spots.advance(0, 1.8, 80, 4000, 'road', 0.08); expect(spots.tyres[0].severity).toBe(0);
  spots.advance(0, 1.8, 80, 4000, 'road', 0.2); expect(spots.tyres[0].severity).toBeGreaterThan(0);
  expect(spots.tyres[1].severity).toBe(0);
});

it('retains flat spots through cooling, normal driving and recovery; a tyre change clears them', () => {
  const spots = new FlatSpots();
  spots.advance(2, 2, 80, 4000, 'road', 1);
  const reading = spots.tyres[2], damage = reading.severity;
  expect(reading.gripMultiplier).toBeLessThan(1);
  spots.advance(2, 0, 0, 4000, 'road', 600); expect(reading.severity).toBe(damage);
  spots.advance(2, 0, 80, 4000, 'road', 60); expect(reading.severity).toBe(damage);
  spots.advance(2, 2, 80, 4000, 'road', 0); expect(reading.severity).toBe(damage);
  spots.fit(); expect(spots.tyres[2]).toBe(reading); expect(reading.severity).toBe(0); expect(reading.gripMultiplier).toBe(1);
});

it('uses elapsed lock distance consistently and limits damage/grip loss', () => {
  const run = (hz: number) => {
    const spots = new FlatSpots();
    for (let i = 0; i < hz; i++) spots.advance(0, 1.8, 80, 4000, 'road', 1 / hz);
    return spots.tyres[0].severity;
  };
  expect(run(60)).toBeCloseTo(run(360), 6);
  const spots = new FlatSpots(); spots.advance(0, 100, 100, 4000, 'road', 100);
  expect(spots.tyres[0].severity).toBe(1); expect(spots.tyres[0].gripMultiplier).toBeGreaterThanOrEqual(0.8);
  expect(flatSpotGrip(0)).toBe(1); expect(flatSpotGrip(1)).toBeLessThan(1);
});

it('drives bounded tyre-period vibration from spin phase and disappears at rest or with fresh tyres', () => {
  const amp = flatSpotVibration(1, Math.PI / 2, 40);
  expect(amp).toBeGreaterThan(0); expect(amp).toBeLessThanOrEqual(0.003);
  expect(flatSpotVibration(1, Math.PI * 2 + Math.PI / 2, 40)).toBeCloseTo(amp, 10);
  expect(flatSpotVibration(1, 3 * Math.PI / 2, 40)).toBeCloseTo(-amp, 10);
  expect(flatSpotVibration(1, Math.PI / 2, 0)).toBe(0); expect(flatSpotVibration(0, Math.PI / 2, 40)).toBe(0);
});
