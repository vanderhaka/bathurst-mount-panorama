import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { nextCornerSpeed } from '@/game/hud-bridge';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track();
const profile = computeSpeedProfile(track, computeRacingLine(track), CAR_SPECS.camaro, LINE_PROFILE);

/** Profile minimum (km/h) between two lap distances. */
function minBetween(a: number, b: number): number {
  let m = Infinity;
  for (let s = a; s < b; s += track.spacing) m = Math.min(m, profile.speed[Math.floor(track.wrapS(s) / track.spacing) % track.n]);
  return m * 3.6;
}

describe('HUD next-corner speed', () => {
  it('shows the real corner minimum all through a long braking zone, never a mid-zone value', () => {
    // Approach to the Chase (T21 apex near s 5620) from the end of Conrod.
    const apexMin = minBetween(5500, 5700) * 0.97;
    const shown: number[] = [];
    for (let s = 5200; s < 5600; s += 20) {
      const v = nextCornerSpeed(track, profile, s, 80);
      if (v !== null) shown.push(v);
    }
    expect(shown.length).toBeGreaterThan(5);
    for (const v of shown) expect(Math.abs(v - apexMin)).toBeLessThan(4);
  });

  it('shows nothing when the next corner is more than 450 m away', () => {
    // Early Conrod: accelerating, the Chase is more than 1 km ahead.
    const i = Math.floor(4300 / track.spacing);
    expect(nextCornerSpeed(track, profile, 4300, profile.speed[i])).toBeNull();
    expect(nextCornerSpeed(track, profile, 4300, 80)).toBeNull();
  });
});
