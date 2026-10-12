import { describe, expect, it } from 'vitest';
import { RaceOrder, type RaceRunner } from '@/race/field/race-order';

const L = 1000, LINE = 100;
const runner = (n: number, isPlayer = false): RaceRunner => ({ id: `r${n}`, name: `Runner ${n}`, number: String(n), isPlayer });
const runners = (n: number) => Array.from({ length: n }, (_, i) => runner(i, i === 0));

/** Every car starts 10 m behind the line and drives at its own constant speed. */
function drive(order: RaceOrder, speeds: number[], until: number, dt = 0.3): void {
  speeds.forEach((_, i) => order.place(i, LINE - 10));
  for (let n = 1; n * dt <= until + 1e-9; n++) speeds.forEach((v, i) => order.update(i, (LINE - 10 + v * n * dt) % L, n * dt));
}

/** Same, but resumable: advances an existing order to `until` from `from`. */
function advance(order: RaceOrder, speeds: number[], from: number, until: number, dt = 0.3): void {
  for (let n = Math.round(from / dt) + 1; n * dt <= until + 1e-9; n++) speeds.forEach((v, i) => order.update(i, (LINE - 10 + v * n * dt) % L, n * dt));
}

describe('RaceOrder laps', () => {
  it('begins lap 1 at the first crossing and completes a lap at each further one', () => {
    const o = new RaceOrder(L, LINE, 3, runners(1));
    o.place(0, LINE - 10);
    advance(o, [50], 0, 0.3);
    expect(o.lapsDone(0)).toBe(0);
    advance(o, [50], 0.3, 5.1);
    expect(o.lapsDone(0)).toBe(0);
    expect(o.standings()[0].progressM).toBeGreaterThan(0);
    advance(o, [50], 5.1, 20.5);
    expect(o.lapsDone(0)).toBe(1);
    advance(o, [50], 20.5, 40.5);
    expect(o.lapsDone(0)).toBe(2);
    expect(o.finished(0)).toBe(false);
  });

  it('starts on lap 1 when the grid sits just past the line (Bathurst): the first crossing completes a short lap 1', () => {
    const o = new RaceOrder(L, LINE, 2, runners(1));
    o.place(0, LINE + 50);
    expect(o.standings()[0].progressM).toBeCloseTo(50);
    expect(o.lapsDone(0)).toBe(0);
    for (let n = 1; n <= 20; n++) o.update(0, (LINE + 50 + 50 * n) % L, n);
    expect(o.lapsDone(0)).toBe(1);
    expect(o.standings()[0].bestLapS).toBeNull();
    for (let n = 21; n <= 40; n++) o.update(0, (LINE + 50 + 50 * n) % L, n);
    expect(o.finished(0)).toBe(true);
    expect(o.standings()[0].finishTimeS).toBeCloseTo(39);
  });

  it('starts behind the line when the grid sits far before it', () => {
    const o = new RaceOrder(L, LINE, 3, runners(1));
    o.place(0, LINE + 300);
    expect(o.standings()[0].progressM).toBeCloseTo(300 - L);
  });

  it('does not count extra laps for driving backwards over the line and forwards again', () => {
    const o = new RaceOrder(L, LINE, 3, runners(1));
    o.place(0, LINE - 10);
    let t = 0;
    const go = (s: number) => o.update(0, s, (t += 0.1));
    for (const s of [LINE - 5, LINE + 5, LINE - 5, LINE - 10, LINE - 5, LINE + 5, LINE + 15]) go(s);
    expect(o.lapsDone(0)).toBe(0);
    for (let s = LINE + 15; s < LINE + L + 20; s += 10) go(s % L);
    expect(o.lapsDone(0)).toBe(1);
  });

  it('ignores jumps over 200 m and places without counting progress', () => {
    const o = new RaceOrder(L, LINE, 3, runners(1));
    o.place(0, 300);
    const p = o.standings()[0].progressM;
    o.update(0, 310, 0.1);
    o.update(0, 700, 0.2);
    expect(o.standings()[0].progressM).toBeCloseTo(p + 10);
    o.place(0, 100);
    expect(o.standings()[0].progressM).toBeCloseTo(p + 10);
    o.update(0, 110, 0.3);
    expect(o.standings()[0].progressM).toBeCloseTo(p + 20);
    expect(o.lapsDone(0)).toBe(0);
  });

  it('takes the best lap from interpolated crossing times', () => {
    const o = new RaceOrder(L, LINE, 5, runners(1));
    drive(o, [50], 41);
    expect(o.standings()[0].bestLapS).toBeCloseTo(20, 9);
  });
});

describe('RaceOrder finishing', () => {
  it('finishes in order with interpolated finish times', () => {
    const o = new RaceOrder(L, LINE, 2, runners(3));
    drive(o, [40, 50, 45], 60);
    // 2 laps = 2000 m from 10 m behind the line.
    const byIndex = (i: number) => o.standings().find((x) => x.index === i)!;
    expect(byIndex(1).finishTimeS).toBeCloseTo(2010 / 50, 9);
    expect(byIndex(2).finishTimeS).toBeCloseTo(2010 / 45, 9);
    expect(byIndex(0).finishTimeS).toBeCloseTo(2010 / 40, 9);
    expect(o.standings().map((x) => x.index)).toEqual([1, 2, 0]);
    expect(o.standings().map((x) => x.position)).toEqual([1, 2, 3]);
    expect(byIndex(2).gapS).toBeCloseTo(2010 / 45 - 2010 / 50, 9);
    expect(byIndex(1).gapS).toBeNull();
    expect(o.leaderFinished).toBe(true);
    expect(o.allFinished).toBe(true);
  });

  it('flags the leader first, keeping the others running', () => {
    const o = new RaceOrder(L, LINE, 2, runners(2));
    drive(o, [50, 40], 41);
    expect(o.leaderFinished).toBe(true);
    expect(o.allFinished).toBe(false);
    expect(o.finished(0)).toBe(true);
    expect(o.finished(1)).toBe(false);
  });

  it('gives a lapped car the flag at its next crossing, a lap down', () => {
    const o = new RaceOrder(L, LINE, 2, runners(2));
    drive(o, [50, 20], 55);
    const lapped = o.standings().find((x) => x.index === 1)!;
    expect(lapped.finished).toBe(true);
    expect(lapped.lapsDown).toBe(1);
    expect(lapped.lapsDone).toBe(1);
    expect(lapped.finishTimeS).toBeCloseTo(1010 / 20, 9);
    expect(o.allFinished).toBe(true);
  });
});

describe('RaceOrder ordering and gaps', () => {
  it('orders by progress and estimates the gap from the leader\'s earlier passage', () => {
    const o = new RaceOrder(L, LINE, 5, runners(2));
    drive(o, [40, 50], 10, 0.5);
    const s = o.standings();
    expect(s.map((x) => x.index)).toEqual([1, 0]);
    // The leader was at the follower's 390 m (progress) at t = 8 s; the follower is there at t = 10 s.
    expect(s[1].gapS).toBeCloseTo(2, 6);
    expect(s[0].gapS).toBeNull();
  });

  it('has no gap before the leader has a sample at that distance', () => {
    const o = new RaceOrder(L, LINE, 5, runners(2));
    o.place(0, LINE - 10);
    o.place(1, LINE - 12);
    expect(o.standings()[1].gapS).toBeNull();
  });

  it('breaks ties by index and keeps positions 1-based', () => {
    const o = new RaceOrder(L, LINE, 5, runners(3));
    [0, 1, 2].forEach((i) => o.place(i, LINE - 20));
    expect(o.standings().map((x) => x.position)).toEqual([1, 2, 3]);
    expect(o.standings().map((x) => x.index)).toEqual([0, 1, 2]);
    expect(o.position(2)).toBe(3);
  });

  it('puts the car further back on the grid behind', () => {
    const o = new RaceOrder(L, LINE, 5, runners(2));
    o.place(0, LINE - 20);
    o.place(1, LINE - 7);
    expect(o.position(1)).toBe(1);
    expect(o.position(0)).toBe(2);
  });
});
