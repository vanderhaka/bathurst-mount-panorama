import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

it('reset loads on slopes', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  const inp = { throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false, hold: true };
  for (const s of [150, 900, 1300, 2100, 3000, 3520, 3600, 3700, 4200, 4400]) {
    const i = Math.round(s / track.spacing);
    v.reset(s, line.offset[i]);
    const p0 = v.pitch;
    v.step(inp, 1 / 360);
    const l1 = v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',');
    for (let k = 0; k < 360; k++) v.step(inp, 1 / 360);
    console.log(`s=${s} grade=${(track.grade[i] * 100).toFixed(1)}% bank=${(track.bank?.[i] ?? 0).toFixed(3)} pitch0=${(p0 * 57.3).toFixed(1)} loads@1step=${l1} loads@1s=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')} pitch1s=${(v.pitch * 57.3).toFixed(1)}`);
  }
});
