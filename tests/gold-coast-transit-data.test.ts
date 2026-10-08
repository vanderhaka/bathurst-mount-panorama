import { describe, expect, it } from 'vitest';
import { createGoldCoastTrack } from '@/track/gold-coast';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import { GOLD_COAST_TRACKSIDE, HIGHWAY_HALF, TRAM_GAUGE, transitCentreDistance, transitDistance } from '@/world/gold-coast-geo';

describe('Gold Coast tram, highway and footbridge data', () => {
  const track = createGoldCoastTrack();
  const out: [number, number, number] = [0, 0, 0];
  const at = (s: number, d: number): [number, number] => { pointAt(track, s, d, out); return [out[0], out[2]]; };
  const wallAt = (side: 'left' | 'right', s: number) => {
    const f = track.wrapS(s) / track.spacing;
    return Math.max(track[side].wall[Math.floor(f) % track.n], track[side].wall[track.wrap(Math.floor(f) + 1)]);
  };
  const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const pitStraight = [...range(2620, 2960, 4), ...range(0, 400, 4)];

  it('has the expected shape with finite coordinates', () => {
    const t = GOLD_COAST_TRACKSIDE;
    expect(t.tram.length).toBeGreaterThanOrEqual(10);
    // The 7 ways beside the pit straight, then both carriageways onward to 380 m from the race line.
    expect(t.highway.map(w => w.osmId)).toEqual(expect.arrayContaining([22915204, 22915203, 22915021, 578653982, 22915041, 22915042, 424230703]));
    expect(t.highway.filter(w => w.bridge)).toHaveLength(2);
    expect(t.stations.map(s => s.name).sort()).toEqual(['Main Beach', 'Surfers Paradise North']);
    expect(t.footBridges.map(b => b.id)).toEqual(['A', 'C', 'D']);
    const coords = [...t.tram, ...t.highway].flatMap(w => w.points.flat()).concat(t.stations.flatMap(s => [s.x, s.z]), t.footBridges.flatMap(b => b.ends.flat()));
    expect(coords.every(v => Number.isFinite(v) && Math.abs(v) <= 3000)).toBe(true);
  });

  it('places each footbridge across the track beyond the walls', () => {
    const p = createTrackPoint();
    for (const b of GOLD_COAST_TRACKSIDE.footBridges) {
      const [[x0, z0], [x1, z1]] = b.ends;
      projectToTrack(track, (x0 + x1) / 2, (z0 + z1) / 2, -1, p);
      expect(Math.abs(p.s - b.s)).toBeLessThan(3);
      const a = projectToTrack(track, x0, z0, -1, createTrackPoint()), c = projectToTrack(track, x1, z1, -1, createTrackPoint());
      expect(Math.sign(a.d)).toBe(-Math.sign(c.d));
      for (const e of [a, c]) expect(Math.abs(e.d)).toBeGreaterThan(wallAt(e.d > 0 ? 'left' : 'right', e.s) + 1);
    }
  });

  it('finds the highway and tram beside the pit straight but not the race track', () => {
    for (const s of [2700, 2800, 2900, 50, 150]) {
      expect(transitDistance(...at(s, -20.4)), `highway at s ${s}`).toBeLessThan(0);
      expect(transitDistance(...at(s, 0)), `race track at s ${s}`).toBeGreaterThan(0);
      expect(transitCentreDistance(...at(s, -35)).tram, `tram at s ${s}`).toBeLessThan(4);
    }
  });

  it('keeps tram rails outside the right wall near T4 and along the pit straight', () => {
    for (const s of range(640, 780, 2)) {
      expect(transitCentreDistance(...at(s, -(wallAt('right', s) + 0.25))).tram, `s ${s}`).toBeGreaterThanOrEqual(TRAM_GAUGE / 2 + 0.2);
    }
    for (const s of [...range(2560, 2960, 4), ...range(0, 480, 4)]) {
      for (let d = -wallAt('right', s); d <= wallAt('left', s); d += 1) {
        expect(transitCentreDistance(...at(s, d)).tram, `s ${s} d ${d}`).toBeGreaterThan(TRAM_GAUGE / 2);
      }
    }
  });

  it('keeps the public highway outside the walls on the pit straight', () => {
    for (const s of pitStraight) {
      for (let d = -wallAt('right', s); d <= wallAt('left', s); d += 1) {
        expect(transitCentreDistance(...at(s, d)).highway, `s ${s} d ${d}`).toBeGreaterThan(HIGHWAY_HALF);
      }
    }
  });

  it('answers 200,000 terrain-sized queries in under 1.5 s', () => {
    transitDistance(0, 0);
    let seed = 12345, sum = 0;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 3000 - 1500;
    const t0 = performance.now();
    for (let i = 0; i < 200000; i++) sum += Math.min(transitDistance(rnd(), rnd()), 100);
    expect(Number.isFinite(sum)).toBe(true);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
