import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetGraphics } from '@/config/graphics';
import { createGoldCoastTrack } from '@/track/gold-coast';
import { GOLD_COAST_TRACKSIDE, HIGHWAY_HALF, inWater, transitCentreDistance, type TransitWay } from '@/world/gold-coast-geo';
import { buildGoldCoastTerrain } from '@/world/gold-coast-terrain';
import { buildGoldCoastTransit, type GoldCoastTransit } from '@/world/gold-coast-transit';
import type { Terrain } from '@/world/terrain';

afterEach(resetGraphics);

const track = createGoldCoastTrack();
let terrain: Terrain, high: GoldCoastTransit, low: GoldCoastTransit, buildMs = 0;
beforeAll(() => {
  terrain = buildGoldCoastTerrain(track, 'low');
  const t0 = performance.now();
  high = buildGoldCoastTransit(track, terrain, 'high');
  buildMs = performance.now() - t0;
  low = buildGoldCoastTransit(track, terrain, 'low');
}, 120000);
afterAll(() => { high.dispose(); low.dispose(); terrain.dispose(); });

const names = (g: THREE.Object3D) => { const out: string[] = []; g.traverse(o => out.push(o.name)); return out; };
const named = (g: THREE.Object3D, n: string) => g.getObjectByName(n) as THREE.Mesh;

/** Centreline samples (1 m apart) of a way with their deck flag. */
function walk(way: TransitWay) {
  const out: Array<{ x: number; z: number; deck: boolean }> = [];
  for (let i = 0; i + 1 < way.points.length; i++) {
    const [ax, az] = way.points[i], [bx, bz] = way.points[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
    for (let k = 0; k < n; k++) { const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n; out.push({ x, z, deck: way.bridge || inWater(x, z) }); }
  }
  return out;
}

describe('Gold Coast transit', { timeout: 120000 }, () => {
  it('builds the high tier within the draw-call budget', () => {
    expect(high.group.name).toBe('gold-coast-transit');
    let objects = 0;
    high.group.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) objects++; });
    expect(objects).toBeLessThanOrEqual(14);
    const all = names(high.group);
    for (const n of ['gold-coast-transit-surface', 'gold-coast-transit-structures', 'gold-coast-transit-wire']) expect(all).toContain(n);
    expect(high.group.children.filter(c => c.name === 'gold-coast-tram')).toHaveLength(2);
    console.log(`transit high build ${buildMs.toFixed(0)} ms`);
  });

  it('keeps the low tier to surface and structures only', () => {
    const all = names(low.group);
    expect(all).not.toContain('gold-coast-tram');
    expect(all).not.toContain('gold-coast-transit-wire');
    expect(low.cars).toHaveLength(0);
    expect(all).toContain('gold-coast-transit-surface');
    expect(all).toContain('gold-coast-transit-structures');
  });

  it('never paves the race track', () => {
    const p = named(high.group, 'gold-coast-transit-surface').geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) expect(terrain.clearance(p.getX(i), p.getZ(i))).toBeGreaterThanOrEqual(0.1);
  });

  it('covers the highway and tram centrelines at the expected height', () => {
    high.group.updateMatrixWorld(true);
    const decks = [...GOLD_COAST_TRACKSIDE.highway, ...GOLD_COAST_TRACKSIDE.tram].flatMap(w => walk(w).filter(o => o.deck));
    const ray = new THREE.Raycaster(), targets = [named(high.group, 'gold-coast-transit-surface'), named(high.group, 'gold-coast-transit-structures')];
    for (const ways of [GOLD_COAST_TRACKSIDE.highway, GOLD_COAST_TRACKSIDE.tram]) {
      const picks: Array<{ x: number; z: number; y: number }> = [];
      for (const way of ways) {
        const pts = walk(way);
        pts.forEach((q, i) => {
          if (terrain.clearance(q.x, q.z) <= 3) return;
          // Ramps run 15 m off each deck; only test deck points and points clear of any deck.
          // A neighbouring way's deck can also span the ground here, so keep 8 m clear of every deck.
          const clear = q.deck || (pts.slice(Math.max(0, i - 16), i + 17).every(o => !o.deck) && decks.every(o => Math.hypot(o.x - q.x, o.z - q.z) > 8));
          if (clear) picks.push({ x: q.x, z: q.z, y: q.deck ? 0.02 : terrain.heightAt(q.x, q.z) + 0.02 });
        });
      }
      expect(picks.length).toBeGreaterThanOrEqual(40);
      for (let k = 0; k < 40; k++) {
        const q = picks[Math.floor(k * picks.length / 40)];
        ray.set(new THREE.Vector3(q.x, 10, q.z), new THREE.Vector3(0, -1, 0));
        const hit = ray.intersectObjects(targets, false)[0];
        expect(hit, `no surface at ${q.x.toFixed(1)}, ${q.z.toFixed(1)}`).toBeDefined();
        expect(Math.abs(hit.point.y - q.y), `${hit.object.name} at ${q.x.toFixed(1)}, ${q.z.toFixed(1)} hit ${hit.point.y} want ${q.y}`).toBeLessThan(0.1);
      }
    }
  });

  it('places deterministic cars on the carriageway', () => {
    expect(high.cars.length).toBeGreaterThanOrEqual(20);
    expect(high.cars.length).toBeLessThanOrEqual(400);
    const again = buildGoldCoastTransit(track, terrain, 'high');
    expect(again.cars).toEqual(high.cars);
    again.dispose();
    for (const c of high.cars) {
      expect(transitCentreDistance(c.x, c.z).highway).toBeLessThanOrEqual(HIGHWAY_HALF);
      expect(terrain.clearance(c.x, c.z)).toBeGreaterThanOrEqual(2);
    }
  });

  it('stands each tram on a track, aligned with it', () => {
    for (const tram of high.group.children.filter(c => c.name === 'gold-coast-tram')) {
      const { x, z } = tram.position;
      expect(transitCentreDistance(x, z).tram).toBeLessThanOrEqual(0.5);
      const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(tram.quaternion);
      let best = { d: Infinity, tx: 0, tz: 0 };
      for (const way of GOLD_COAST_TRACKSIDE.tram) for (let i = 0; i + 1 < way.points.length; i++) {
        const [ax, az] = way.points[i], [bx, bz] = way.points[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)), d = Math.hypot(x - ax - t * dx, z - az - t * dz);
        if (d < best.d) best = { d, tx: dx / Math.sqrt(l2), tz: dz / Math.sqrt(l2) };
      }
      const angle = Math.acos(Math.min(1, Math.abs(axis.x * best.tx + axis.z * best.tz))) * 180 / Math.PI;
      expect(angle).toBeLessThan(5);
    }
  });

  it('disposes twice without throwing', () => {
    const t = buildGoldCoastTransit(track, terrain, 'high');
    expect(() => { t.dispose(); t.dispose(); }).not.toThrow();
  });
});
