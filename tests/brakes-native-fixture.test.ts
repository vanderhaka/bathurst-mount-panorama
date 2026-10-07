import { expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Track } from '@/track/track-model';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';

it('keeps a digital full-brake approach to The Chase on the actual track without a steering adapter', () => {
  const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
  const approaches = [5300, 5350, 5400].map(s0 => {
    const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
    v.stint.fitTyres('soft', 95);
    v.reset(s0, line.offset[Math.floor(s0 / track.spacing)]);
    v.vx = Math.sin(v.heading) * 82; v.vz = Math.cos(v.heading) * 82;
    let impacts = 0, steps = 0;
    while (v.speed > 32 && steps < 8 * 360) {
      impacts += v.step({ throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false }, 1 / 360).length;
      steps++;
    }
    return { s0, finishS: v.tp.s, speed: v.speed, impacts, steps };
  });
  console.log(JSON.stringify({ nativeChaseApproaches: approaches, chaseS: track.corners.find(c => c.turn === 21)?.s }));
  for (const approach of approaches) {
    expect(approach.impacts).toBe(0);
    expect(approach.speed).toBeLessThanOrEqual(32);
  }
});

it('reaches real fade through repeated native-style stops and produces a lock from a fresh ABS-off set', () => {
  const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
  const input = { throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false };
  const hot = new Vehicle(CAR_SPECS.camaro, track, kerbs), stops = [];
  const place = (v: Vehicle, s = 5400, speed = 82) => {
    v.reset(s, line.offset[Math.floor(s / track.spacing)]);
    v.vx = Math.sin(v.heading) * speed; v.vz = Math.cos(v.heading) * speed;
  };
  for (let stop = 0; stop < 12 && hot.brakes.discs.every(disc => disc.forceMultiplier > 0.98); stop++) {
    place(hot); let steps = 0, impacts = 0;
    while (hot.speed > 32 && steps < 8 * 360) { impacts += hot.step(input, 1 / 360).length; steps++; }
    stops.push({ peakC: Math.max(...hot.brakes.discs.map(disc => disc.tempC)), impacts, speed: hot.speed });
  }
  const locked = new Vehicle(CAR_SPECS.camaro, track, kerbs); locked.assists.abs = false; place(locked, 1300, 50);
  let lockImpacts = 0;
  for (let step = 0; step < 0.6 * 360; step++) lockImpacts += locked.step(input, 1 / 360).length;
  console.log(JSON.stringify({ digitalStressStops: stops, freshLock: locked.flatSpots.tyres, lockImpacts }));
  expect(stops.every(stop => stop.impacts === 0 && stop.speed <= 32)).toBe(true);
  expect(hot.brakes.discs.some(disc => disc.forceMultiplier <= 0.98)).toBe(true);
  expect(hot.flatSpots.tyres.every(tyre => tyre.severity === 0)).toBe(true);
  expect(locked.flatSpots.tyres.some(tyre => tyre.severity > 0)).toBe(true); expect(lockImpacts).toBe(0);
});
