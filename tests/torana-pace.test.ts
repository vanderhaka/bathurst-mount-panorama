import { describe, expect, it } from 'vitest';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, MEASURED_HANDLING, tunedSpec } from '@/config/handling';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track();
const line = computeRacingLine(track);
const profile = (kind: CarKind, handling: typeof DEFAULT_HANDLING) => computeSpeedProfile(track, line, tunedSpec(CAR_SPECS[kind], handling), LINE_PROFILE);

// 1979 pole 2:20.5 on the layout without the Chase; the Chase (1987) costs about 5 s: 145.5 s today.
// The real Gen3 pole is 2:04.0; both cars are scaled by the same game-to-reality ratio R.
const TORANA_REAL_S = 145.5;
const GEN3_POLE_S = 124.0;

describe('Torana A9X pace', () => {
  it("matches the 1979 pace on today's layout", () => {
    const camaroLap = profile('camaro', MEASURED_HANDLING).lapTimeS;
    const r = camaroLap / GEN3_POLE_S;
    const toranaLap = profile('torana', MEASURED_HANDLING).lapTimeS;
    console.log(`R ${r.toFixed(4)}, camaro lap ${camaroLap.toFixed(2)} s, torana lap ${toranaLap.toFixed(2)} s, target ${(r * TORANA_REAL_S).toFixed(2)} s`);
    expect(Math.abs(toranaLap - r * TORANA_REAL_S)).toBeLessThanOrEqual(1.5);
  });

  it('reaches the 1979 Conrod trap speed', () => {
    const top = profile('torana', MEASURED_HANDLING).topSpeed * 3.6;
    console.log(`torana top speed ${top.toFixed(1)} km/h`);
    expect(top).toBeGreaterThanOrEqual(249);
    expect(top).toBeLessThanOrEqual(269);
  });

  it('stays slower than every Gen3 car at the default handling', () => {
    const toranaLap = profile('torana', DEFAULT_HANDLING).lapTimeS;
    console.log(`torana lap at default handling ${toranaLap.toFixed(2)} s`);
    for (const kind of ['camaro', 'mustang', 'supra'] as CarKind[]) expect(toranaLap).toBeGreaterThanOrEqual(profile(kind, DEFAULT_HANDLING).lapTimeS + 12);
  });
});
