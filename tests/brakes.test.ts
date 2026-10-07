import { describe, expect, it } from 'vitest';
import { brakeContact } from '@/physics/brake-contact';
import { BrakeModel, brakeFade, brakeGlow, DISC_THERMAL } from '@/physics/brake-heat';
import { tyreForces, type TyreResult } from '@/physics/tyre';
import { FlatSpots } from '@/physics/flat-spots';
import { CAR_SPECS } from '@/car/car-specs';
import { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';

const result = (overrides: Partial<TyreResult> = {}): TyreResult => ({ fx: -4000, fy: 0, use: 0.8, absActive: false, tcActive: false, ...overrides });

describe('brake energy and cooling', () => {
  it('uses delivered caliper work and excludes engine braking, standstill and a locked rotor', () => {
    const normal = brakeContact(3000, 1.6, 50, 0, 4000, result());
    expect(normal.powerW).toBe(200000); expect(normal.lockUse).toBe(0);
    expect(brakeContact(3000, 1.6, -50, 0, 4000, result({ fx: 4000 })).powerW).toBe(200000);
    expect(brakeContact(3000, 1.6, 50, -1000, 0, result({ fx: -1000 })).powerW).toBe(0);
    expect(brakeContact(3000, 1.6, 0, 0, 4000, result()).powerW).toBe(0);
    expect(brakeContact(0, 1.6, 50, 0, 4000, result()).powerW).toBe(0);
    const locked = brakeContact(3000, 1.6, 50, 0, 8000, result({ fx: -4128, use: 1.67 }));
    expect(locked.lockUse).toBeCloseTo(8000 / 4800); expect(locked.powerW).toBe(0);
  });

  it('accounts for ABS-reduced brake force without declaring cornering or traction slides locked', () => {
    const abs = brakeContact(3000, 1.6, 50, 0, 8000, result({ fx: -4560, absActive: true }));
    expect(abs.powerW).toBe(228000); expect(abs.lockUse).toBe(0);
    expect(brakeContact(3000, 1.6, 50, 0, 2000, result({ fx: -2000, fy: 4000, use: 1.8 })).lockUse).toBe(0);
    expect(brakeContact(3000, 1.6, 50, 8000, 0, result({ fx: 4128, use: 1.67 })).lockUse).toBe(0);
  });

  it('converts the same measured work into consistent temperatures across time steps', () => {
    const run = (hz: number) => {
      const brakes = new BrakeModel();
      for (let i = 0; i < hz; i++) brakes.advance(0, 200000, 50, 1 / hz);
      return brakes.discs[0];
    };
    const a = run(60), b = run(360);
    expect(a.tempC).toBeCloseTo(b.tempC, 8); expect(a.energyJ).toBeCloseTo(200000, 5);
    const noLossRise = 200000 / DISC_THERMAL.front.capacityJPerC;
    expect(a.tempC - 22).toBeLessThan(noLossRise); expect(a.tempC - 22).toBeGreaterThan(noLossRise * 0.98);
    expect(a.forceMultiplier).toBe(1);
  });

  it('cools faster on a straight, recovers fade, and leaves paused/invalid steps unchanged', () => {
    const parked = new BrakeModel(900), moving = new BrakeModel(900);
    const reading = moving.discs[0];
    moving.advance(0, 100000, 80, 0); moving.advance(0, 100000, 80, NaN);
    expect(reading.tempC).toBe(900);
    // Compare while the parked disc is still in fade; both recover fully over a longer cooldown.
    parked.advance(0, 0, 0, 30); moving.advance(0, 0, 80, 30);
    expect(moving.discs[0]).toBe(reading);
    expect(moving.discs[0].tempC).toBeLessThan(parked.discs[0].tempC);
    expect(moving.discs[0].forceMultiplier).toBeGreaterThan(parked.discs[0].forceMultiplier);
    moving.advance(0, 0, 80, 10000); expect(reading.tempC).toBeCloseTo(22, 5); expect(reading.forceMultiplier).toBe(1);
  });
});

it('keeps ordinary braking unchanged and smoothly bounds force/glow at extreme temperatures', () => {
  expect(brakeFade(22)).toBe(1); expect(brakeFade(600)).toBe(1); expect(brakeFade(700)).toBe(1);
  expect(brakeFade(800)).toBeLessThan(brakeFade(750)); expect(brakeFade(800)).toBeGreaterThan(brakeFade(950));
  expect(brakeFade(2000)).toBeGreaterThanOrEqual(0.55);
  expect(brakeFade(700.001)).toBeCloseTo(brakeFade(699.999), 6);
  expect(brakeGlow(22)).toBe(0); expect(brakeGlow(800)).toBeGreaterThan(brakeGlow(500)); expect(brakeGlow(1500)).toBe(1);
});

it('the faded request delivers less tyre braking at the same pedal, load and speed', () => {
  const spec = CAR_SPECS.camaro, warm = new BrakeModel(500), hot = new BrakeModel(900);
  const load = spec.massKg * 9.81 * spec.frontWeight / 2, tyre = result();
  const delivered = (brakes: BrakeModel) => {
    const request = 0.4 * spec.maxBrakeTorqueNm / spec.dimensions.wheelRadius * brakes.discs[0].forceMultiplier;
    tyreForces(load, spec.tyreMu, 40, 0, 0, request, true, false, load / 9.81, 1 / 360, tyre);
    return -tyre.fx;
  };
  const normal = delivered(warm), faded = delivered(hot);
  expect(normal).toBeCloseTo(0.4 * spec.maxBrakeTorqueNm / spec.dimensions.wheelRadius, 5);
  expect(faded).toBeLessThan(normal * 0.8); expect(faded).toBeGreaterThan(normal * 0.5);
});

it('the real tyre solver produces persistent lock damage with ABS off and avoids it with ABS on', () => {
  for (const abs of [false, true]) {
    const tyre = result(), spots = new FlatSpots(), brakes = new BrakeModel(400), dt = 1 / 360;
    for (let k = 0; k < 180; k++) {
      const mu = 1.62 * spots.tyres[0].gripMultiplier;
      tyreForces(3000, mu, 80, 0, 0, 10000, abs, false, 3000 / 9.81, dt, tyre);
      const contact = brakeContact(3000, mu, 80, 0, 10000, tyre);
      brakes.advance(0, contact.powerW, 80, dt); spots.advance(0, contact.lockUse, 80, 3000, 'road', dt);
    }
    if (abs) { expect(spots.tyres[0].severity).toBe(0); expect(brakes.discs[0].tempC).toBeGreaterThan(400); }
    else { expect(spots.tyres[0].severity).toBeGreaterThan(0.1); expect(brakes.discs[0].tempC).toBeLessThan(400); }
  }
});

it('successive late Chase braking replays raise brake heat to fade and reduce delivered brake force', () => {
  const track = new Track(), spec = CAR_SPECS.camaro, brakes = new BrakeModel(400);
  const tyre: TyreResult = result(), p: [number, number, number] = [0, 0, 0], dt = 1 / 360;
  const peaks: number[] = [], initial = spec.maxBrakeTorqueNm / spec.dimensions.wheelRadius;
  for (let stop = 0; stop < 3; stop++) {
    let speed = 82, s = 5400;
    // Repeated stress replays preserve hot brakes but start each car approach at full speed.
    while (speed > 32 && s < 5650) {
      pointAt(track, s, 0, p); expect(p.every(Number.isFinite)).toBe(true);
      let force = 0;
      for (let w = 0; w < 4; w++) {
        const front = w < 2, load = spec.massKg * 9.81 * (front ? 0.72 : 0.28) / 2;
        const request = initial * (front ? 1 : (1 - spec.brakeBiasFront) / spec.brakeBiasFront) * brakes.discs[w].forceMultiplier;
        tyreForces(load, spec.tyreMu, speed, 0, 0, request, true, false, load / 9.81, dt, tyre);
        const contact = brakeContact(load, spec.tyreMu, speed, 0, request, tyre);
        brakes.advance(w, contact.powerW, speed, dt); force -= tyre.fx;
      }
      const next = Math.max(0, speed - force / spec.massKg * dt);
      s += (speed + next) * 0.5 * dt; speed = next;
    }
    expect(speed).toBeLessThanOrEqual(32.1); expect(s).toBeGreaterThan(5400); expect(s).toBeLessThan(5650);
    peaks.push(brakes.discs[0].tempC);
    for (let k = 0; k < 360 * 10; k++) for (let w = 0; w < 4; w++) brakes.advance(w, 0, 50, dt);
  }
  expect(peaks.at(-1)!).toBeGreaterThan(700); expect(Math.max(...peaks)).toBeLessThan(1100);
  expect(brakes.discs[0].forceMultiplier).toBeLessThan(1);
  expect(peaks[1]).toBeGreaterThan(peaks[0]); expect(brakes.discs[0].energyJ).toBeGreaterThan(3e6);
  console.log(JSON.stringify({ chaseReplayPeakC: peaks, cooledFade: brakes.discs[0].forceMultiplier, workJ: brakes.discs[0].energyJ }));
});
