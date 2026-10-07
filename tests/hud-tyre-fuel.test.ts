// Display-only tyre and fuel estimate (src/hud/tyre-fuel-model.ts, tyre-heat.ts).
import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { FUEL_START_L, TyreFuelEstimator, tyreBand } from '@/hud/tyre-fuel-model';
import { Vehicle } from '@/physics/vehicle';
import { AI_PROFILE, Autopilot } from '@/race/autopilot';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import type { HudState } from '@/types/hud';

type Wheels = NonNullable<HudState['wheels']>;
const FL = 0, FR = 1, RL = 2, RR = 3;

/** Minimal HudState for the estimator (it reads lap, speed, pedals, g and wheels). */
function est(lap: number, t: number, over: Partial<HudState> = {}): HudState {
  return {
    speedKmh: 180,
    throttle: 1,
    brake: 0,
    steer: 0,
    lap: { number: lap, currentS: t, lastS: null, bestS: null, deltaS: null, valid: true, currentSector: 0, sectors: [] },
    ...over,
  } as HudState;
}

function drive(m: TyreFuelEstimator, lap: number, from: number, to: number, over: Partial<HudState> = {}): void {
  for (let t = from; t <= to + 1e-9; t += 0.1) m.update(est(lap, t, over));
}

function wheels(loads: number[], slips = [0.5, 0.5, 0.5, 0.5]): Wheels {
  return loads.map((load, i) => ({ load, slip: slips[i] }));
}

describe('tyre temperature mechanisms', () => {
  it('bands tyre temperatures', () => {
    expect(tyreBand(50)).toBe('cold');
    expect(tyreBand(80)).toBe('warm');
    expect(tyreBand(95)).toBe('ok');
    expect(tyreBand(110)).toBe('hot');
    expect(tyreBand(120)).toBe('over');
  });

  it('braking heats the fronts more than the rears (60 % bias, load forward)', () => {
    const m = new TyreFuelEstimator();
    drive(m, 1, 0, 20, { speedKmh: 200, throttle: 0, brake: 1, gLong: -1.8, gLat: 0, wheels: wheels([5200, 5200, 2600, 2600]) });
    expect(m.tyres[FL].tempC).toBeGreaterThan(m.tyres[RL].tempC + 5);
    expect(m.tyres[FR].tempC).toBeGreaterThan(m.tyres[RR].tempC + 5);
  });

  it('cornering heats both axles, the outside (loaded) tyres most', () => {
    const m = new TyreFuelEstimator();
    // Left-hander: + gLat, load on the right-hand tyres.
    drive(m, 1, 0, 20, { speedKmh: 140, throttle: 0.4, gLat: 1.9, gLong: 0, wheels: wheels([2400, 5400, 2300, 5000]) });
    const [fl, fr, rl, rr] = m.tyres.map((t) => t.tempC);
    expect(fr).toBeGreaterThan(fl);
    expect(rr).toBeGreaterThan(rl);
    expect(Math.min(fl, rl)).toBeGreaterThan(60); // inside tyres still warm up
  });

  it('traction and wheelspin heat only the rears', () => {
    const grip = new TyreFuelEstimator();
    const spin = new TyreFuelEstimator();
    const exit = { speedKmh: 90, throttle: 1, gLat: 0, gLong: 0.7 };
    drive(grip, 1, 0, 15, { ...exit, wheels: wheels([3200, 3200, 3800, 3800], [0.1, 0.1, 0.9, 0.9]) });
    drive(spin, 1, 0, 15, { ...exit, wheels: wheels([3200, 3200, 3800, 3800], [0.1, 0.1, 1.4, 1.4]) });
    expect(grip.tyres[RL].tempC).toBeGreaterThan(grip.tyres[FL].tempC + 3);
    expect(spin.tyres[RL].tempC).toBeGreaterThan(grip.tyres[RL].tempC + 5);
    expect(spin.tyres[FL].tempC).toBeCloseTo(grip.tyres[FL].tempC, 5);
  });

  it('falls back to a g-force load model without telemetry, and resets on restart', () => {
    const m = new TyreFuelEstimator();
    drive(m, 1, 0, 30, { steer: 0.3, throttle: 0.6 }); // sustained left turn from steering
    expect(m.tyres[FR].tempC).toBeGreaterThan(m.tyres[FL].tempC);
    expect(m.tyres[FR].wear).toBeGreaterThan(0);
    m.update(est(0, 0.5)); // session restart: back to the out lap
    expect(m.fuel.litres).toBe(FUEL_START_L);
    expect(m.tyres[FR].wear).toBe(0);
  });
});

describe('fuel', () => {
  it('burns fuel with throttle x sim time, and not while the clock is stopped', () => {
    const m = new TyreFuelEstimator();
    drive(m, 1, 0, 10);
    const used = FUEL_START_L - m.fuel.litres;
    expect(used).toBeGreaterThan(0.4);
    expect(used).toBeLessThan(0.55);
    const before = m.fuel.litres;
    for (let k = 0; k < 50; k++) m.update(est(1, 10)); // paused: same lap time
    expect(m.fuel.litres).toBe(before);
    const idle = new TyreFuelEstimator();
    drive(idle, 1, 0, 10, { throttle: 0 });
    expect(FUEL_START_L - idle.fuel.litres).toBeLessThan(used / 10);
  });

  it('reports laps left only from complete laps, updated at the line', () => {
    const m = new TyreFuelEstimator();
    drive(m, 0, 0, 20, { throttle: 0.65 }); // out lap: not a complete lap
    m.update(est(1, 0.1, { throttle: 0.65 }));
    expect(m.fuel.lapsLeft).toBeNull();
    drive(m, 1, 0.2, 120, { throttle: 0.65 });
    expect(m.fuel.lapsLeft).toBeNull(); // no nominal guess before the first full lap
    m.update(est(2, 0.1, { throttle: 0.65 }));
    const first = m.fuel.lapsLeft;
    if (first === null) throw new Error('laps left missing after a full lap');
    const perLap = m.fuel.litres / first;
    expect(perLap).toBeGreaterThan(3.5);
    expect(perLap).toBeLessThan(4.5);
    drive(m, 2, 0.2, 60, { throttle: 1 }); // mid-lap, very different throttle
    expect(m.fuel.lapsLeft).toBe(first); // frozen until the next line crossing
    drive(m, 2, 60.1, 120, { throttle: 0.3 });
    m.update(est(3, 0.1, { throttle: 0.3 }));
    expect(m.fuel.lapsLeft).not.toBe(first);
  });

  it('ignores laps too short to be real (teleport / debug skip)', () => {
    const m = new TyreFuelEstimator();
    drive(m, 1, 0, 20);
    m.update(est(2, 0.1));
    expect(m.fuel.lapsLeft).toBeNull();
  });
});

describe('calibration on the real physics (autopilot laps of Mount Panorama)', () => {
  it('sits at ~80-100 C with fronts >= rears, and the L/R split follows the corners', () => {
    const track = new Track();
    const line = computeRacingLine(track);
    const spec = CAR_SPECS.camaro;
    const v = new Vehicle(spec, track, placeKerbs(track, line));
    const ap = new Autopilot(track, line, computeSpeedProfile(track, line, spec, AI_PROFILE));
    const s0 = track.wrapS(track.startLineS - 300);
    v.reset(s0, line.offset[Math.round(s0 / track.spacing) % track.n]);
    const input = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
    const m = new TyreFuelEstimator();
    const DT = 1 / 360;
    let t = 0, lap = 0, lapStart = 0, prevS = v.tp.s, step = 0;
    const atLine: number[][] = [];
    const lr: Array<[number, number]> = []; // [right - left, lateral g 1.5 s earlier]
    const gHistory: number[] = [];
    while (lap < 4 && t < 600) {
      ap.drive(v, input);
      v.step(input, DT);
      t += DT;
      const s = v.tp.s;
      if (prevS < track.startLineS && s >= track.startLineS && s - prevS < 50) {
        lap++;
        lapStart = t;
        atLine.push(m.tyres.map((x) => x.tempC));
      }
      prevS = s;
      if (++step % 6 !== 0) continue; // the HUD updates at 60 Hz
      const tl = v.telemetry;
      m.update({
        speedKmh: Math.abs(tl.speed) * 3.6, throttle: tl.throttle, brake: tl.brake, steer: tl.steer, gLat: tl.gLat, gLong: tl.gLong, wheels: tl.wheels,
        lap: { number: lap, currentS: t - lapStart, lastS: null, bestS: null, deltaS: null, valid: true, currentSector: 0, sectors: [] },
      } as unknown as HudState);
      gHistory.push(tl.gLat);
      if (lap === 3 && gHistory.length > 90) {
        const T = m.tyres.map((x) => x.tempC);
        lr.push([(T[FR] + T[RR] - T[FL] - T[RL]) / 2, gHistory[gHistory.length - 91]]);
      }
    }
    expect(atLine.length).toBe(4);
    for (const temps of atLine.slice(2)) {
      // Flying laps: all four in a similar band, fronts at or above rears on each side.
      for (const c of temps) {
        expect(c).toBeGreaterThan(78);
        expect(c).toBeLessThan(102);
      }
      expect(temps[FL]).toBeGreaterThanOrEqual(temps[RL] - 0.5);
      expect(temps[FR]).toBeGreaterThanOrEqual(temps[RR] - 0.5);
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    const afterLeft = mean(lr.filter(([, g]) => g > 1).map(([d]) => d));
    const afterRight = mean(lr.filter(([, g]) => g < -1).map(([d]) => d));
    expect(afterLeft).toBeGreaterThan(afterRight + 2); // right tyres flare in left-handers
  }, 60000);
});
