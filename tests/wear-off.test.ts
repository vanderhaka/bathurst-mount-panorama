import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { BrakeModel } from '@/physics/brake-heat';
import { FlatSpots } from '@/physics/flat-spots';
import { TYRE_COMPOUNDS, TyreModel, tyreGrip } from '@/physics/tyre-state';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const DT = 1 / 360;
const go = (throttle: number, brake: number): VehicleInput => ({ throttle, brake, steer: 0.05, shiftUp: false, shiftDown: false });
const BEST = tyreGrip('soft', (TYRE_COMPOUNDS.soft.minC + TYRE_COMPOUNDS.soft.maxC) / 2, 0);

function drive(wear = true): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.assists = { ...v.assists, wear };
  v.stint.reset({ fuelL: 80, tempC: 95 });
  v.reset(track.startLineS + 30, 0);
  for (let i = 0; i < 360 * 6; i++) v.step(go(1, 0), DT);
  for (let i = 0; i < 360 * 2; i++) v.step(go(0, 1), DT);
  return v;
}

/** 60 m/s with ABS off and full brake on asphalt: the wheels lock above the flat-spot speed. */
function lockup(wear = true, startTempC = 95): Vehicle {
  const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
  v.assists = { ...v.assists, abs: false, wear };
  v.stint.reset({ fuelL: 80, tempC: startTempC });
  v.reset(1300, 0);
  v.vx = Math.sin(v.heading) * 60;
  v.vz = Math.cos(v.heading) * 60;
  for (let i = 0; i < 360 * 2; i++) v.step(go(0, 1), DT);
  return v;
}

const snapshot = (v: Vehicle) => [
  v.x, v.z, v.speed,
  v.stint.tyres.map((t) => [t.tempC, t.wear, t.grip]),
  v.brakes.discs.map((d) => [d.tempC, d.forceMultiplier]),
  v.flatSpots.tyres.map((t) => t.severity),
];

/**
 * Matches the recorded numbers to 1e-9 relative. They were recorded on macOS arm64; Linux x64 CI
 * differs in the last bit of some Math functions. A real physics change grows far beyond 1e-9
 * over thousands of steps.
 */
function expectRecorded(actual: unknown, recorded: unknown): void {
  const flat = (x: unknown): number[] => (Array.isArray(x) ? x.flatMap(flat) : [x as number]);
  const a = flat(actual), r = flat(recorded);
  expect(a).toHaveLength(r.length);
  a.forEach((n, i) => expect(Math.abs(n - r[i]), `value ${i}: ${n} vs ${r[i]}`).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(r[i]))));
}

describe('wear on: physics unchanged', () => {
  // Recorded from the code before the wear switch existed.
  it('a drive with hard braking gives the original numbers', () => {
    expectRecorded(snapshot(drive()), [355.2494805066508, -1258.0984027148722, 10.413262324984373,
      [[97.75400287801622, 0.00026453036959966827, 0.999982174624353], [98.03572053599287, 0.00027867837314701034, 0.9999810245552293],
        [97.21885631792496, 0.0002968726428775676, 0.9999795283777658], [97.5553959689781, 0.00032041768080400684, 0.9999775649102346]],
      [[65.78547218065751, 1], [109.8227307277457, 1], [39.364821839295246, 1], [58.433522066646674, 1]], [0, 0, 0, 0]]);
  });

  it('a lock-up gives the original numbers, flat spots and tyre wear included', () => {
    expectRecorded(snapshot(lockup()), [42.81295810145214, -390.8941946935391, 0.07485457054009981,
      [[150, 0.007314633879663903, 0.7992340698891462], [137.07549599273509, 0.002620078834291352, 0.8037312050497748],
        [114.29330775510776, 0.0009068259598758284, 0.9651110552354981], [148.15950548359, 0.004554989527522221, 0.7995661467144224]],
      [[22, 1], [130.01368710283754, 1], [22, 1], [22.00265790047993, 1]],
      [0.21997383956595584, 0.001972175430229571, 0.11856619125657936, 0.19233689394164463]]);
  });
});

describe('wear off', () => {
  it('keeps tyre grip at its best through a hard lock-up and forms no flat spots', () => {
    const off = lockup(false), on = lockup(true);
    for (const t of off.stint.tyres) { expect(t.grip).toBe(BEST); expect(t.wear).toBe(0); }
    for (const f of off.flatSpots.tyres) { expect(f.severity).toBe(0); expect(f.gripMultiplier).toBe(1); }
    expect(on.stint.tyres.some((t) => t.grip < BEST - 0.1)).toBe(true);
    expect(on.stint.tyres.every((t) => t.wear > 0)).toBe(true);
    expect(on.flatSpots.tyres.some((f) => f.severity > 0 && f.gripMultiplier < 1)).toBe(true);
  });

  it('ignores tyre temperature: cold tyres grip like warm ones', () => {
    const cold = lockup(false, 30), warm = lockup(false, 95);
    for (let w = 0; w < 4; w++) expect(cold.stint.tyres[w].grip).toBe(warm.stint.tyres[w].grip);
    expect(lockup(true, 30).stint.tyres[0].grip).toBeLessThan(BEST);
  });

  it('does not wear tyres over long heavy driving but still shows the temperature', () => {
    const heavy = { ...go(1, 0), steer: 0.4 };
    for (const wear of [false, true]) {
      const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
      v.assists = { ...v.assists, wear };
      v.stint.reset({ fuelL: 80, tempC: 95 });
      v.reset(track.startLineS + 30, 0);
      for (let i = 0; i < 360 * 20; i++) v.step(heavy, DT);
      expect(v.stint.tyres[0].tempC).toBeGreaterThan(60);
      if (wear) expect(v.stint.tyres[0].wear).toBeGreaterThan(0);
      else { expect(v.stint.tyres[0].wear).toBe(0); expect(v.stint.tyres[0].grip).toBe(BEST); }
    }
  });

  it('stops existing flat spots costing grip while wear is off', () => {
    const run = (severity: number) => {
      const v = new Vehicle(CAR_SPECS.camaro, track, kerbs);
      v.assists = { ...v.assists, wear: false };
      v.stint.reset({ fuelL: 80, tempC: 95 });
      v.reset(1300, 0);
      for (const f of v.flatSpots.tyres) Object.assign(f, { severity, gripMultiplier: 1 - 0.18 * severity });
      v.vx = Math.sin(v.heading) * 50;
      v.vz = Math.cos(v.heading) * 50;
      for (let i = 0; i < 180; i++) v.step(go(0, 0.6), DT);
      return v.speed;
    };
    expect(run(1)).toBe(run(0));
  });

  it('FlatSpots forms nothing with wear off and restarts the lock count', () => {
    const spots = new FlatSpots();
    spots.advance(0, 2, 80, 4000, 'road', 1, false);
    expect(spots.tyres[0].severity).toBe(0);
    spots.advance(0, 2, 80, 4000, 'road', 1);
    expect(spots.tyres[0].severity).toBeGreaterThan(0);
  });

  it('TyreModel holds best grip and zero wear with wear off', () => {
    const tyres = new TyreModel('soft', 40, 0.5);
    const input = { ...go(1, 0), speed: 70, gLat: 2, gLong: 1, brake: 0 } as never;
    for (let i = 0; i < 3600; i++) tyres.advance(input, 70, DT, false);
    for (const t of tyres.tyres) { expect(t.grip).toBe(BEST); expect(t.wear).toBe(0.5); }
  });

  it('brake discs get hot without fading; with fade they do', () => {
    const off = new BrakeModel(), on = new BrakeModel();
    for (let i = 0; i < 3600; i++) { off.advance(0, 400_000, 20, 0.01, false); on.advance(0, 400_000, 20, 0.01); }
    expect(off.discs[0].tempC).toBeGreaterThan(900);
    expect(off.discs[0].forceMultiplier).toBe(1);
    expect(on.discs[0].forceMultiplier).toBeLessThan(0.8);
  });
});
