import { it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

it('susp', () => {
  const track = new Track();
  const line = computeRacingLine(track);
  const kerbs = placeKerbs(track, line);
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.reset(4400, 0);
  // give it speed along heading
  const sp = 50;
  v.vx = Math.sin(v.heading) * sp; v.vz = Math.cos(v.heading) * sp;
  const inp = { throttle: 0.6, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
  v.pt.gear = 4;
  const DT = 1 / 360;
  for (let k = 0; k < 360 * 1.5; k++) {
    v.step(inp, DT);
    if (k % 12 === 0) {
      const anyV = v as unknown as { comps: number[] };
      console.log(`k=${k} y=${v.y.toFixed(3)} vy=${v.vy.toFixed(2)} p=${v.pitch.toFixed(4)} r=${v.roll.toFixed(4)} comps=${anyV.comps.map((c) => c.toFixed(3)).join(',')} loads=${v.wheels.map((w) => (w.load / 1000).toFixed(1)).join(',')} d=${v.tp.d.toFixed(2)} yaw=${v.yawRate.toFixed(3)}`);
    }
  }
});
