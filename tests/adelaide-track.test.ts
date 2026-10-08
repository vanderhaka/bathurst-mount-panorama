import { describe, expect, it } from 'vitest';
import { hudTrackInfo } from '@/game/hud-bridge';
import { createAdelaideTrack } from '@/track/adelaide';
import { circuitFromSearch, circuitUrl } from '@/track/circuits';
import { CORNERS, SECTOR_STARTS_S } from '@/track/layout';
import { Track } from '@/track/track-model';
import bathurstSource from '@/track/data/mount-panorama.json';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';

describe('circuit selection', () => {
  it('keeps Bathurst as the default and rejects unknown circuit names', () => {
    expect(circuitFromSearch('')).toBe('bathurst');
    expect(circuitFromSearch('?track=adelaide')).toBe('adelaide');
    expect(circuitFromSearch('?track=unknown')).toBe('bathurst');
  });

  it('preserves other URL options when switching or returning to Bathurst', () => {
    expect(circuitUrl('https://example.com/?quality=low#race', 'adelaide')).toBe('https://example.com/?quality=low&track=adelaide#race');
    expect(circuitUrl('https://example.com/?track=adelaide&quality=low#race', 'bathurst')).toBe('https://example.com/?quality=low#race');
  });
});

describe('2026 Adelaide Parklands circuit', () => {
  const track = createAdelaideTrack();

  it('uses the current 3.219 km clockwise route with a continuous timing-line seam', () => {
    let length = 0, turn = 0;
    for (let i = 0; i < track.n; i++) {
      const j = track.wrap(i + 1);
      const gap = Math.hypot(track.px[j] - track.px[i], track.pz[j] - track.pz[i]);
      expect(gap).toBeGreaterThan(track.spacing * 0.97);
      expect(gap).toBeLessThan(track.spacing * 1.01);
      length += gap;
      turn += track.curvature[i] * track.spacing;
    }
    expect(track.id).toBe('adelaide');
    expect(track.length).toBe(3219);
    expect(Math.abs(length - track.length)).toBeLessThan(1);
    expect(turn * 180 / Math.PI).toBeCloseTo(-360, -1);
    expect(track.startLineS).toBe(0);
    expect(track.lapFraction(track.length - 1)).toBeGreaterThan(0.99);
    expect(Math.max(...track.py) - Math.min(...track.py)).toBe(0);
  });

  it('labels all 14 turns in race order and the opening left-right-left sequence', () => {
    expect(track.corners.map(c => c.turn)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    expect(track.corners.slice(0, 3).map(c => c.dir)).toEqual(['L', 'R', 'L']);
    expect(track.corners[7].dir).toBe('R');
    expect(track.corners[13].dir).toBe('R');
    expect(track.corners.every((c, i) => c.s > (track.corners[i - 1]?.s ?? 0) && c.s < track.length)).toBe(true);
    expect(track.placeAt(1500)).toBe('Bartels Road');
  });

  it('has street walls, runoff and fences without Bathurst terrain or corner data', () => {
    for (let i = 0; i < track.n; i++) for (const side of [track.left, track.right]) {
      expect(side.edge[i]).toBeGreaterThanOrEqual(4);
      expect(side.wall[i] - side.edge[i]).toBeGreaterThan(1.3);
      expect(side.surface[i]).toBe('asphalt');
      expect(side.fence[i]).toBe(1);
    }
    expect(track.kerbCorners.every(c => c.reference.includes('Adelaide'))).toBe(true);
    expect(track.kerbCorners.some(c => c.turn === 21)).toBe(false);
  });

  it('projects both sides of each turn back to the correct circuit position', () => {
    const p: [number, number, number] = [0, 0, 0], tp = createTrackPoint();
    for (const corner of track.corners) for (const d of [-2, 2]) {
      const s = corner.s - 12;
      pointAt(track, s, d, p);
      projectToTrack(track, p[0], p[2], Math.floor(s / track.spacing), tp);
      expect(Math.abs(tp.s - s)).toBeLessThan(0.6);
      expect(tp.d).toBeCloseTo(d, 1);
    }
  });

  it('shows Adelaide turns and estimated sector positions in the HUD', () => {
    const info = hudTrackInfo(track);
    expect(info.lengthM).toBe(3219);
    expect(info.name).toBe('Adelaide Parklands');
    expect(info.city).toBe('Adelaide');
    expect(info.elevationEstimated).toBe(true);
    expect(info.corners).toHaveLength(14);
    expect(info.sectorStarts).toEqual(track.sectorStarts.map(s => track.lapFraction(s)));
    expect(info.corners.some(c => c.name.includes('Chase'))).toBe(false);
  });

  it('preserves the existing Bathurst layout and timing metadata', () => {
    const bathurst = new Track();
    expect(bathurst.id).toBe('bathurst');
    expect(bathurst.length).toBe(6213);
    expect(bathurst.startLineS).toBe(bathurstSource.meta.finishLineS);
    expect(bathurst.gridLineS).toBe(bathurstSource.meta.startLineS);
    expect(bathurst.corners).toEqual(CORNERS);
    expect(bathurst.sectorStarts).toEqual(SECTOR_STARTS_S);
    expect(hudTrackInfo(bathurst).name).toBe('Mount Panorama');
    expect(hudTrackInfo(bathurst).city).toBe('Bathurst');
    expect(hudTrackInfo(bathurst).elevationEstimated).toBe(false);
  });
});
