import { expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Track } from '@/track/track-model';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';

// Inside The Chase T21 the gravel trap is wider than the bend's radius: past the bend's centre two sections of
// road are about equally near. The front and rear wheels once read ground from different sections (a 1.9 m
// step under one car) and the bump stop threw a parked car tens of metres into the air.
it('a car parked in the T21 gravel trap stays on the ground', () => {
  const track = new Track(), line = computeRacingLine(track);
  const v = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, line));
  const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  for (const [s, d] of [[5600, 36], [5600, 40.5], [5620, 42], [5620, 45], [5640, 39], [5650, 45], [5610, 33]]) {
    v.reset(s, d);
    const y0 = v.y;
    let maxVy = 0, maxRise = 0;
    for (let k = 0; k < 360 * 3; k++) {
      v.step(input, 1 / 360);
      maxVy = Math.max(maxVy, v.vy);
      maxRise = Math.max(maxRise, v.y - y0);
    }
    expect(maxVy, `s=${s} d=${d}`).toBeLessThan(1);
    expect(maxRise, `s=${s} d=${d}`).toBeLessThan(0.5);
  }
});
