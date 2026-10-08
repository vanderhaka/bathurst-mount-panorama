import { expect, it } from 'vitest';
import * as THREE from 'three';
import { Marbles, planMarbles } from '@/fx/marbles';
import { Track } from '@/track/track-model';
import { computeRacingLine } from '@/track/racing-line';
import { heightAt, sampleArray } from '@/track/track-query';

it('places deterministic rubber debris on asphalt away from the racing line, inside both road edges', () => {
  const track = new Track(), line = computeRacingLine(track), points = planMarbles(track, line, 19);
  expect(points).toEqual(planMarbles(track, line, 19));
  expect(points.length).toBeGreaterThan(1000); expect(points.length).toBeLessThanOrEqual(4096);
  for (const p of points) {
    const f = track.wrapS(p.s) / track.spacing, i = Math.floor(f), t = f - i;
    expect(Math.abs(p.d - sampleArray(track, line.offset, i, t))).toBeGreaterThanOrEqual(1.7);
    expect(p.d).toBeLessThan(sampleArray(track, track.left.edge, i, t) - 0.15);
    expect(-p.d).toBeLessThan(sampleArray(track, track.right.edge, i, t) - 0.15);
    expect(p.y).toBeCloseTo(heightAt(track, i, t, p.d) + 0.005, 5);
    expect(p.size).toBeGreaterThanOrEqual(0.015); expect(p.size).toBeLessThanOrEqual(0.04);
  }
  expect(new Set(points.map((p) => Math.floor(p.s / 1000))).size).toBeGreaterThan(5);
});

it('draws only nearby marbles in one capped batch, with quality switch and disposal', () => {
  const track = new Track(), line = computeRacingLine(track), scene = new THREE.Scene();
  const marbles = new Marbles(scene, track, line, { count: 128, distance: 90, seed: 19 });
  marbles.update(6200);
  expect(marbles.mesh.count).toBeGreaterThan(0); expect(marbles.mesh.count).toBeLessThanOrEqual(128);
  for (const p of marbles.snapshot()) {
    const delta = Math.abs(track.wrapS(p.s - 6200 + track.length / 2) - track.length / 2);
    expect(delta).toBeLessThanOrEqual(90);
  }
  expect((marbles.mesh.geometry.index?.count ?? marbles.mesh.geometry.getAttribute('position').count) / 3).toBeLessThanOrEqual(8);
  marbles.configure({ enabled: false }); marbles.update(100); expect(marbles.mesh.count).toBe(0);
  let disposed = 0; marbles.mesh.addEventListener('dispose', () => disposed++);
  marbles.mesh.geometry.addEventListener('dispose', () => disposed++); marbles.mesh.material.addEventListener('dispose', () => disposed++);
  marbles.dispose(); marbles.dispose(); expect(disposed).toBe(3); expect(scene.children).toEqual([]);
});
