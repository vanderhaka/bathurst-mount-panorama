import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@vercel/analytics', () => ({ inject: vi.fn(), track: vi.fn() }));

type Analytics = typeof import('@/game/usage-analytics');
type Vercel = typeof import('@vercel/analytics');

let usage: Analytics;
let vercel: Vercel;

beforeEach(async () => {
  vi.resetModules();
  vercel = await import('@vercel/analytics');
  vi.mocked(vercel.inject).mockClear();
  vi.mocked(vercel.track).mockClear();
  usage = await import('@/game/usage-analytics');
});

describe('usage analytics', () => {
  it('sends nothing before init', () => {
    usage.trackRaceStart('bathurst', 'camaro');
    usage.trackLapsDriven('bathurst', 'camaro', 1);
    expect(vercel.inject).not.toHaveBeenCalled();
    expect(vercel.track).not.toHaveBeenCalled();
  });

  it('init(false) does nothing and later events send nothing', () => {
    usage.initUsageAnalytics(false);
    usage.trackRaceStart('bathurst', 'camaro');
    usage.trackLapsDriven('bathurst', 'camaro', 1);
    expect(vercel.inject).not.toHaveBeenCalled();
    expect(vercel.track).not.toHaveBeenCalled();
  });

  it('init(true) injects once', () => {
    usage.initUsageAnalytics(true);
    usage.initUsageAnalytics(true);
    expect(vercel.inject).toHaveBeenCalledTimes(1);
    expect(vercel.inject).toHaveBeenCalledWith({ mode: 'production' });
  });

  it('sends race_start with track and car only', () => {
    usage.initUsageAnalytics(true);
    usage.trackRaceStart('bathurst', 'camaro');
    expect(vercel.track).toHaveBeenCalledExactlyOnceWith('race_start', { track: 'bathurst', car: 'camaro' });
  });

  it('sends one event per lap milestone only (at most 5 for a 60-lap race)', () => {
    usage.initUsageAnalytics(true);
    for (let laps = 1; laps <= 60; laps++) usage.trackLapsDriven('adelaide', 'supra', laps);
    expect(vercel.track).toHaveBeenCalledTimes(5);
    expect(vi.mocked(vercel.track).mock.calls).toEqual(
      [1, 5, 10, 25, 50].map((n) => [`laps_${n}`, { track: 'adelaide', car: 'supra' }]),
    );
  });

  it('sends no lap event before init', () => {
    usage.trackLapsDriven('bathurst', 'mustang', 1);
    expect(vercel.track).not.toHaveBeenCalled();
  });

  it('is off by default outside the production build', () => {
    usage.initUsageAnalytics();
    expect(vercel.inject).not.toHaveBeenCalled();
  });
});
