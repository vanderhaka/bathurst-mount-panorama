import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { createTrackPoint, heightAt, projectToTrack } from '@/track/track-query';

const track = new Track();

describe('Mount Panorama track model', () => {
  it('has the official length and a closed loop', () => {
    let len = 0;
    for (let i = 0; i < track.n; i++) {
      const j = (i + 1) % track.n;
      len += Math.hypot(track.px[j] - track.px[i], track.pz[j] - track.pz[i]);
    }
    expect(track.length).toBe(6213);
    expect(Math.abs(len - 6213) / 6213).toBeLessThan(0.01);
  });

  it('has a realistic elevation range (~174 m)', () => {
    const ys = Array.from(track.py);
    const range = Math.max(...ys) - Math.min(...ys);
    expect(range).toBeGreaterThan(165);
    expect(range).toBeLessThan(185);
  });

  it('turns 360 degrees anticlockwise (mostly left turns)', () => {
    let total = 0;
    for (let i = 0; i < track.n; i++) total += track.curvature[i] * track.spacing;
    expect((total * 180) / Math.PI).toBeCloseTo(360, -1);
  });

  it('climbs Mountain Straight and descends Conrod Straight', () => {
    const at = (s: number) => track.py[Math.round(s / track.spacing)];
    expect(at(1500) - at(700)).toBeGreaterThan(30);
    expect(at(4100) - at(5250)).toBeGreaterThan(50);
  });

  it('projects world points back to (s, d)', () => {
    const p = createTrackPoint();
    for (const i of [10, 400, 900, 1300]) {
      const d = 2.5;
      const x = track.px[i] + track.lx[i] * d, z = track.pz[i] + track.lz[i] * d;
      projectToTrack(track, x, z, i, p);
      expect(Math.abs(p.s - i * track.spacing)).toBeLessThan(0.5);
      expect(p.d).toBeCloseTo(d, 1);
      expect(Math.abs(heightAt(track, p.index, p.t, 0) - track.py[i])).toBeLessThan(0.5);
    }
  });
});

describe('racing line and speed profile', () => {
  const line = computeRacingLine(track);
  const profile = computeSpeedProfile(track, line, CAR_SPECS.camaro);

  it('stays inside the road edges', () => {
    for (let i = 0; i < track.n; i++) {
      expect(line.offset[i]).toBeLessThanOrEqual(track.left.edge[i]);
      expect(line.offset[i]).toBeGreaterThanOrEqual(-track.right.edge[i]);
    }
  });

  it('predicts a Gen3-like lap and top speed', () => {
    const kmh = (v: number) => v * 3.6;
    const report: Record<string, string> = {};
    for (const [name, s] of [['Hell', 470], ['Griffins', 1600], ['Cutting', 2100], ['Reid', 2420], ['McPhillamy', 3080], ['Skyline', 3410], ['Esses', 3550], ['Dipper', 3625], ['Forrests', 4000], ['Chase', 5620], ['Murrays', 6185]] as const) {
      const i0 = Math.round((s - 40) / track.spacing), i1 = Math.round((s + 40) / track.spacing);
      let mn = Infinity;
      for (let i = i0; i <= i1; i++) mn = Math.min(mn, profile.speed[i % track.n]);
      report[name] = kmh(mn).toFixed(0);
    }
    const maxConrod = Math.max(...Array.from(profile.speed.slice(Math.round(4100 / track.spacing), Math.round(5320 / track.spacing))));
    const maxMountain = Math.max(...Array.from(profile.speed.slice(Math.round(600 / track.spacing), Math.round(1560 / track.spacing))));
    console.log('lap', profile.lapTimeS.toFixed(2), 's  top', kmh(profile.topSpeed).toFixed(0), 'conrod', kmh(maxConrod).toFixed(0), 'mountain', kmh(maxMountain).toFixed(0), JSON.stringify(report));
    expect(profile.lapTimeS).toBeGreaterThan(115);
    expect(profile.lapTimeS).toBeLessThan(140);
    expect(kmh(maxConrod)).toBeGreaterThan(270);
  });
});

describe('vertical curves', () => {
  // Gen3 cars go light over the crests and compress through the dips, but never leave
  // the ground or bottom out: no fake bumps between the contour data points.
  it('keeps crest unloading under 0.6 g and dip loading under 1 g at full racing speed', () => {
    const track = new Track();
    const p = computeSpeedProfile(track, computeRacingLine(track), CAR_SPECS.mustang);
    const n = track.n, k = 3, h = k * track.spacing;
    let crest = 0, dip = 0;
    for (let i = 0; i < n; i++) {
      const kv = (track.py[(i - k + n) % n] - 2 * track.py[i] + track.py[(i + k) % n]) / (h * h);
      const a = (p.speed[i] * p.speed[i] * kv) / 9.81;
      crest = Math.min(crest, a);
      dip = Math.max(dip, a);
    }
    expect(-crest).toBeLessThan(0.6);
    expect(dip).toBeLessThan(1.0);
  });
});
