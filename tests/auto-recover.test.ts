import { describe, expect, it } from 'vitest';
import { AutoRecover, facingWrongWay, type RecoverInput } from '@/race/auto-recover';
import { Track } from '@/track/track-model';

const base: RecoverInput = { speed: 0, offTrack: false, wrongWay: false, throttle: 0 };

/** Runs fixed steps until it triggers; returns the elapsed time or null. */
function timeToTrigger(state: RecoverInput, limitS = 10, dts: number[] = [1 / 60]): number | null {
  const r = new AutoRecover();
  let t = 0;
  for (let i = 0; t < limitS; i++) {
    const dt = dts[i % dts.length];
    t += dt;
    if (r.update(dt, state)) return t;
  }
  return null;
}

describe('AutoRecover', () => {
  it('triggers once after 3 s stuck off track at 0.5 m/s, then counts again', () => {
    const s = { ...base, speed: 0.5, offTrack: true };
    const t = timeToTrigger(s) ?? 0;
    expect(t).toBeGreaterThanOrEqual(3);
    expect(t).toBeLessThan(3.05);
    const r = new AutoRecover();
    let hits = 0;
    for (let i = 0; i < 60 * 5; i++) if (r.update(1 / 60, s)) hits++;
    expect(hits).toBe(1);
    for (let i = 0; i < 60 * 2; i++) if (r.update(1 / 60, s)) hits++;
    expect(hits).toBe(2);
  });

  it('never triggers when moving at 5 m/s off track, in either direction', () => {
    expect(timeToTrigger({ ...base, speed: 5, offTrack: true, wrongWay: true, throttle: 1 }, 30)).toBeNull();
    expect(timeToTrigger({ ...base, speed: -5, offTrack: true }, 30)).toBeNull();
  });

  it('never triggers when stopped on track with no throttle and facing forward', () => {
    expect(timeToTrigger(base, 60)).toBeNull();
    expect(timeToTrigger({ ...base, throttle: 0.5 }, 60)).toBeNull();
  });

  it('triggers when stopped on track with the throttle down (against a wall)', () => {
    expect(timeToTrigger({ ...base, throttle: 1 })).not.toBeNull();
  });

  it('triggers when facing the wrong way at low speed', () => {
    expect(timeToTrigger({ ...base, speed: -1, wrongWay: true })).not.toBeNull();
  });

  it('handles uneven dt: triggers at or after 3 s and not before', () => {
    const dts = [0.016, 0.033, 0.05];
    const r = new AutoRecover();
    let t = 0, hit: number | null = null;
    for (let i = 0; i < 1000 && hit === null; i++) {
      const dt = dts[i % 3];
      t += dt;
      if (r.update(dt, { ...base, offTrack: true })) hit = t;
    }
    expect(hit).not.toBeNull();
    expect(hit).toBeGreaterThanOrEqual(3);
    expect(hit).toBeLessThan(3.06);
  });

  it('resets the count after the car moves, and on reset()', () => {
    const r = new AutoRecover();
    const stuck = { ...base, offTrack: true };
    for (let i = 0; i < 60 * 2.9; i++) expect(r.update(1 / 60, stuck)).toBe(false);
    r.update(1 / 60, { ...stuck, speed: 6 });
    for (let i = 0; i < 60 * 2.9; i++) expect(r.update(1 / 60, stuck)).toBe(false);
    r.reset();
    for (let i = 0; i < 60 * 2.9; i++) expect(r.update(1 / 60, stuck)).toBe(false);
  });
});

describe('facingWrongWay', () => {
  const track = new Track();
  const forward = (i: number) => Math.atan2(track.tx[i], track.tz[i]);
  const indices = [0, Math.floor(track.wrapS(track.startLineS) / track.spacing), 100, 500, 1500, 3000]
    .filter((i) => i < track.px.length);

  it('is false for a car aligned with the track, including the start line', () => {
    for (const i of indices) expect(facingWrongWay(track, i, forward(i))).toBe(false);
  });

  it('is true for a car reversed on the track', () => {
    for (const i of indices) expect(facingWrongWay(track, i, forward(i) + Math.PI)).toBe(true);
  });

  it('switches at 100 degrees either side', () => {
    const i = indices[1];
    for (const sign of [1, -1]) {
      expect(facingWrongWay(track, i, forward(i) + sign * 0.99 * (100 * Math.PI) / 180)).toBe(false);
      expect(facingWrongWay(track, i, forward(i) + sign * 1.01 * (100 * Math.PI) / 180)).toBe(true);
    }
  });
});
