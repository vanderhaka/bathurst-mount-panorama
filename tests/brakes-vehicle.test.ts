import { expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import { Track } from '@/track/track-model';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { SessionProfiles } from '@/game/session-profiles';
import { Autopilot } from '@/race/autopilot';

it('actual owned Vehicle brakes heat and fade on successive late Chase approaches within the energy budget', () => {
  const track = new Track(), line = computeRacingLine(track), spec = CAR_SPECS.camaro;
  const v = new Vehicle(spec, track, placeKerbs(track, line));
  v.stint.reset({ tempC: 95 });
  v.brakes.reset(400);
  const profiles = new SessionProfiles(v, line), ap = new Autopilot(track, line, profiles.ai);
  const input = { throttle: 0, brake: 1, steer: 0, shiftUp: false, shiftDown: false };
  const dt = 1 / 360, peaks: number[] = [], work: number[] = [];
  let stepsTotal = 0;
  for (let run = 0; run < 3; run++) {
    const s0 = 5400, i = Math.floor(s0 / track.spacing);
    v.reset(s0, line.offset[i]); v.pt.gear = 6; v.pt.rpm = 6900;
    v.vx = Math.sin(v.heading) * 82; v.vz = Math.cos(v.heading) * 82;
    const mass = v.massKg, startY = v.y, startEnergy = v.brakes.discs.reduce((sum, disc) => sum + disc.energyJ, 0);
    let steps = 0, impacts = 0;
    while (v.speed > 32 && steps < 360 * 8) {
      profiles.update(); ap.drive(v, input); input.throttle = 0; input.brake = 1;
      impacts += v.step(input, dt).length; steps++; stepsTotal++;
    }
    const inputJ = v.brakes.discs.reduce((sum, disc) => sum + disc.energyJ, 0) - startEnergy;
    const availableJ = 0.5 * mass * (82 ** 2 - v.speed ** 2) + mass * 9.81 * (startY - v.y);
    expect(steps).toBeLessThan(360 * 8); expect(v.speed).toBeLessThanOrEqual(32.1);
    expect(v.tp.s).toBeGreaterThan(5400); expect(v.tp.s).toBeLessThan(5700); expect(impacts).toBe(0);
    expect(inputJ).toBeGreaterThan(1e6); expect(inputJ).toBeLessThan(availableJ * 1.02);
    peaks.push(Math.max(...v.brakes.discs.map((disc) => disc.tempC))); work.push(inputJ);
    // The stress replay includes ten seconds of straight-line airflow between reset approaches.
    for (let k = 0; k < 360 * 10; k++) for (let w = 0; w < 4; w++) v.brakes.advance(w, 0, 50, dt);
  }
  expect(stepsTotal * 4).toBeGreaterThan(1000);
  expect(peaks[1]).toBeGreaterThan(peaks[0]); expect(peaks[2]).toBeGreaterThan(700);
  expect(v.brakes.discs.some((disc) => disc.forceMultiplier < 1)).toBe(true);
  expect(v.flatSpots.tyres.every((tyre) => tyre.severity === 0)).toBe(true);
  console.log(JSON.stringify({ actualVehicleChasePeakC: peaks, caliperWorkJ: work, physicsSteps: stepsTotal }));
});
