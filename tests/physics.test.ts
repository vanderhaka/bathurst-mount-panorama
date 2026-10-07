import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track();
const line = computeRacingLine(track);
const kerbs = placeKerbs(track, line);
const DT = 1 / 360;

function input(): VehicleInput {
  return { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
}

describe('vehicle physics', () => {
  it('rests stably on the grid', () => {
    const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
    v.reset(track.gridLineS - 10, 0);
    const y0 = v.y;
    for (let i = 0; i < 360 * 2; i++) v.step(input(), DT);
    expect(Math.abs(v.speed)).toBeLessThan(0.3);
    expect(Math.abs(v.y - y0)).toBeLessThan(0.08);
    const loads = v.wheels.map((w) => w.load);
    const total = loads.reduce((a, b) => a + b, 0);
    expect(total / (v.spec.massKg * 9.81)).toBeGreaterThan(0.95);
    expect(total / (v.spec.massKg * 9.81)).toBeLessThan(1.05);
  });

  it('reverses on a fresh brake press at a standstill (automatic gears), then drives forward on the throttle', () => {
    const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
    v.reset(1300, 0);
    const inp = input();
    // Holding the brake from a stop (after a spin) must not select reverse.
    inp.brake = 1;
    for (let t = 0; t < 3; t += DT) v.step(inp, DT);
    expect(v.pt.gear).toBe(1);
    expect(Math.abs(v.speed)).toBeLessThan(0.5);
    // Release, then press and hold: reverse.
    inp.brake = 0;
    for (let t = 0; t < 0.3; t += DT) v.step(inp, DT);
    inp.brake = 1;
    for (let t = 0; t < 4; t += DT) v.step(inp, DT);
    expect(v.pt.gear).toBe(-1);
    expect(v.speed).toBeLessThan(-2);
    expect(v.speed).toBeGreaterThan(-8);
    inp.brake = 0;
    inp.throttle = 1;
    for (let t = 0; t < 4; t += DT) v.step(inp, DT);
    expect(v.pt.gear).toBeGreaterThanOrEqual(1);
    expect(v.speed).toBeGreaterThan(5);
  });

  it('accelerates 0-100 km/h in a Supercar-like time and brakes hard', () => {
    const v = new Vehicle(CAR_SPECS.mustang, track, kerbs);
    v.reset(4150, 0); // top of Conrod (downhill)
    const inp = input();
    inp.throttle = 1;
    let t = 0;
    while (v.speed < 100 / 3.6 && t < 10) { v.step(inp, DT); t += DT; }
    console.log(`0-100 km/h: ${t.toFixed(2)} s`);
    expect(t).toBeGreaterThan(2.2);
    expect(t).toBeLessThan(5);
  });

  for (const kind of ['camaro', 'mustang'] as CarKind[]) {
    it(`autopilot laps Mount Panorama in the ${kind}`, () => {
      const spec = CAR_SPECS[kind];
      const profile = computeSpeedProfile(track, line, spec);
      // The AI drives a careful profile (AI_PROFILE: 90 % of the grip) at full power on the straights.
      const aiProfile = computeSpeedProfile(track, line, spec, AI_PROFILE);
      const v = new Vehicle(spec, track, kerbs);
      const ap = new Autopilot(track, line, aiProfile);
      const s0 = track.wrapS(track.startLineS - 300);
      v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
      const inp = input();
      let t = 0, crossings = 0, lapStart = 0, lapTime = 0, maxImpact = 0, maxKmh = 0;
      let prevS = v.tp.s;
      while (t < 400 && crossings < 3) {
        ap.drive(v, inp);
        const impacts = v.step(inp, DT);
        for (const im of impacts) maxImpact = Math.max(maxImpact, im.speed);
        t += DT;
        maxKmh = Math.max(maxKmh, v.speed * 3.6);
        const s = v.tp.s;
        const crossed = prevS < track.startLineS && s >= track.startLineS && s - prevS < 50;
        if (crossed) {
          crossings++;
          if (crossings === 2) lapTime = t - lapStart;
          lapStart = t;
        }
        prevS = s;
      }
      console.log(`${kind}: lap ${lapTime.toFixed(2)} s (profile ${profile.lapTimeS.toFixed(2)} s), top ${maxKmh.toFixed(0)} km/h, max impact ${maxImpact.toFixed(1)} m/s, damage ${JSON.stringify(v.damage)}`);
      expect(crossings).toBeGreaterThanOrEqual(2);
      expect(lapTime).toBeGreaterThan(118);
      expect(lapTime).toBeLessThan(145);
      expect(maxImpact).toBeLessThan(1);
    });
  }
});
