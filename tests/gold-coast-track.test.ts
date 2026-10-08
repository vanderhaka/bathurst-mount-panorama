import { describe, expect, it } from 'vitest';
import { hudTrackInfo } from '@/game/hud-bridge';
import { circuitFromSearch, circuitUrl } from '@/track/circuits';
import { createGoldCoastTrack } from '@/track/gold-coast';

describe('circuit selection', () => {
  it('selects the Gold Coast by name and keeps it in the address', () => {
    expect(circuitFromSearch('?track=gold-coast')).toBe('gold-coast');
    expect(circuitUrl('https://example.com/?quality=low#race', 'gold-coast')).toBe('https://example.com/?quality=low&track=gold-coast#race');
  });
});

describe('Surfers Paradise Street Circuit', () => {
  const track = createGoldCoastTrack();
  const dirs = 'LRLLLLRLRLLLRLL';
  const streets: Array<[number[], string]> = [[[1, 2, 3], 'Front Chicane'], [[4], 'Surfers Paradise Boulevard'], [[5], 'Main Beach Parade'],
    [[6, 7, 8, 9, 10], 'Beach Chicane'], [[11], 'Main Beach Parade North'], [[12], 'Breaker Street'], [[13], 'Serisier Avenue'],
    [[14], 'Hill Parade'], [[15], 'Tedder Avenue']];

  it('is 2.960 km anticlockwise with a continuous timing-line seam', () => {
    let length = 0, turn = 0, maxGap = 0;
    for (let i = 0; i < track.n; i++) {
      const j = track.wrap(i + 1);
      const gap = Math.hypot(track.px[j] - track.px[i], track.pz[j] - track.pz[i]);
      maxGap = Math.max(maxGap, gap);
      length += gap;
      turn += track.curvature[i] * track.spacing;
    }
    expect(track.id).toBe('gold-coast');
    expect(track.length).toBe(2960);
    expect(Math.abs(length - track.length)).toBeLessThan(1);
    expect(maxGap).toBeLessThan(2 * track.spacing);
    expect(turn).toBeCloseTo(2 * Math.PI, 0);
    expect(Math.max(...track.py) - Math.min(...track.py)).toBe(0);
    expect(track.elevationBaseM).toBe(7);
  });

  it('labels all 15 turns in race order with the right directions', () => {
    expect(track.corners.map(c => c.turn)).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(track.corners.map(c => c.dir).join('')).toBe(dirs);
    expect(track.corners.every((c, i) => c.s > (track.corners[i - 1]?.s ?? 0) && c.s < track.length)).toBe(true);
  });

  it('places the beach chicane where the aerial photos put it', () => {
    // 10 cm Queensland imagery (2014/2022): bulge, kerb and stand frames put T6 near 1415 m and T10 near 1550 m.
    expect(Math.abs(track.corners[5].s - 1415)).toBeLessThanOrEqual(20);
    expect(Math.abs(track.corners[9].s - 1550)).toBeLessThanOrEqual(25);
    expect(track.placeAt(track.corners[5].s - 50)).toBe('Beach Chicane');
    expect(track.placeAt(track.corners[9].s + 45)).toBe('Main Beach Parade North');
  });

  it('names the street each turn leaves', () => {
    for (const [turns, street] of streets) for (const t of turns) expect(track.placeAt(track.corners[t - 1].s)).toBe(street);
  });

  it('shows the estimated elevation and named turns in the HUD', () => {
    const info = hudTrackInfo(track);
    expect(info.elevationEstimated).toBe(true);
    expect(info.corners).toHaveLength(15);
    expect(info.corners.every(c => c.name.length > 0)).toBe(true);
  });

  it('keeps street widths and wall gaps in range on both sides', () => {
    for (let i = 0; i < track.n; i++) for (const side of [track.left, track.right]) {
      // 4.9 m only where the G:link tram squeezes the run into T4 (src/track/gold-coast-layout.ts).
      expect(side.edge[i]).toBeGreaterThanOrEqual(4.9);
      expect(side.edge[i]).toBeLessThanOrEqual(7.5);
      expect(side.wall[i] - side.edge[i]).toBeGreaterThanOrEqual(1.0);
    }
  });
});
