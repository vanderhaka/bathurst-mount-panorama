import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetGraphics } from '@/config/graphics';
import { createGoldCoastTrack } from '@/track/gold-coast';
import { heightAt, pointAt, createTrackPoint, projectToTrack } from '@/track/track-query';
import { GOLD_COAST_ENV, coastXAt, inSea, inWater } from '@/world/gold-coast-geo';
import { buildGoldCoastTerrain } from '@/world/gold-coast-terrain';

afterEach(resetGraphics);

// Every case builds real terrain geometry: several seconds on a CI runner, so the 5 s default is too tight.
describe('Gold Coast ground, sea and water', { timeout: 60000 }, () => {
  it.each(['low', 'medium', 'high'] as const)('keeps the %s rendered ground below the road and verges', quality => {
    const track = createGoldCoastTrack(), terrain = buildGoldCoastTerrain(track, quality);
    terrain.group.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(), p: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < track.n; i += 7) for (const d of [0, -track.right.edge[i], track.left.edge[i],
      -track.right.wall[i] + 0.2, track.left.wall[i] - 0.2]) {
      pointAt(track, i * track.spacing, d, p);
      const roadY = heightAt(track, i, 0, d);
      expect(terrain.heightAt(p[0], p[2])).toBeLessThan(roadY - 0.04);
      ray.set(new THREE.Vector3(p[0], 5, p[2]), new THREE.Vector3(0, -1, 0));
      const top = ray.intersectObject(terrain.group, true)[0];
      expect(top, `ground gap at ${i}, offset ${d}`).toBeDefined();
      expect(top.point.y, `ground overlaps road at ${i}, offset ${d}`).toBeLessThan(roadY - 0.04);
    }
    terrain.dispose();
  });

  it('extracts the OpenStreetMap environment data', () => {
    const { buildings, water, coastline } = GOLD_COAST_ENV;
    expect(buildings.length).toBeGreaterThanOrEqual(100);
    const q1 = buildings.filter(b => b.osmId === 188325694);
    expect(q1).toHaveLength(1);
    expect(Math.hypot(q1[0].x - 289, q1[0].z - 2275)).toBeLessThan(60);
    expect(q1[0].heightM).toBeGreaterThanOrEqual(300);
    expect(water.length).toBeGreaterThanOrEqual(1);
    expect(coastline[0][1]).toBeLessThanOrEqual(-800);
    expect(coastline.at(-1)![1]).toBeGreaterThanOrEqual(1000);
  });

  it('keeps the circuit out of the sea and lets it cross the channel only on the two causeways', () => {
    const track = createGoldCoastTrack();
    expect(inSea(coastXAt(0) + 60, 0)).toBe(true);
    expect(inSea(0, 0)).toBe(false);
    const p: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < track.n; i += 5) {
      pointAt(track, i * track.spacing, 0, p);
      const s = i * track.spacing, causeway = (s >= 320 && s <= 480) || (s >= 2540 && s <= 2700);
      expect(inSea(p[0], p[2]), `sea at ${i}`).toBe(false);
      if (!causeway) expect(inWater(p[0], p[2]), `water at s ${s}`).toBe(false);
    }
  });

  it('keeps the road and verges at ground height across the causeways', () => {
    const track = createGoldCoastTrack(), terrain = buildGoldCoastTerrain(track, 'low'), p: [number, number, number] = [0, 0, 0];
    let wet = 0;
    for (let i = 0; i < track.n; i += 5) {
      const s = i * track.spacing;
      if (!((s >= 320 && s <= 480) || (s >= 2540 && s <= 2700))) continue;
      for (const d of [0, -(track.right.edge[i] + 0.5), track.left.edge[i] + 0.5]) {
        pointAt(track, s, d, p);
        if (inWater(p[0], p[2])) wet++;
        // Corridor ground sits 0.04-0.5 m under the (flat) road; it is never carved down to the channel bed.
        const y = terrain.heightAt(p[0], p[2]) - heightAt(track, i, 0, d);
        expect(y, `causeway at s ${s}, offset ${d}`).toBeLessThan(-0.04);
        expect(y, `causeway at s ${s}, offset ${d}`).toBeGreaterThan(-0.55);
      }
    }
    expect(wet).toBeGreaterThan(0);
    terrain.dispose();
  });

  it('models the infield channel, the island and the pond', () => {
    const track = createGoldCoastTrack(), terrain = buildGoldCoastTerrain(track, 'low');
    let best: [number, number] | undefined;
    for (let x = 200; x <= 300; x += 1) if (inWater(x, 0) && terrain.clearance(x, 0) >= 6 && (!best || terrain.clearance(x, 0) > terrain.clearance(best[0], 0))) best = [x, 0];
    expect(best, 'a channel point away from the track').toBeDefined();
    expect(terrain.heightAt(best![0], 0)).toBeLessThan(-0.8);
    expect(inWater(-300, 0)).toBe(false);
    const pond = GOLD_COAST_ENV.lakes[0], n = pond.length;
    const centre: [number, number] = [pond.reduce((a, q) => a + q[0], 0) / n, pond.reduce((a, q) => a + q[1], 0) / n];
    expect(inWater(centre[0], centre[1])).toBe(true);
    terrain.dispose();
  });

  it('has no self-intersecting water, hole or lake rings', () => {
    const cross = (a: number[], b: number[], c: number[], d: number[]) => {
      const o = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    };
    for (const ring of [...GOLD_COAST_ENV.water, ...GOLD_COAST_ENV.waterHoles, ...GOLD_COAST_ENV.lakes]) {
      const n = ring.length;
      for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;
        expect(cross(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n]), `segments ${i} and ${j}`).toBe(false);
      }
    }
  });

  it('builds the sea and water surfaces and sinks the ground beneath them', () => {
    const track = createGoldCoastTrack(), terrain = buildGoldCoastTerrain(track, 'low');
    expect(terrain.group.getObjectByName('gold-coast-sea')).toBeInstanceOf(THREE.Mesh);
    expect(terrain.group.getObjectByName('gold-coast-water')).toBeInstanceOf(THREE.Mesh);
    expect(terrain.heightAt(coastXAt(0) + 80, 0)).toBeLessThan(-1.5);
    const beach = terrain.heightAt(coastXAt(0) - 20, 0);
    expect(beach).toBeGreaterThan(-0.05); expect(beach).toBeLessThan(0.05);
    const tp = createTrackPoint();
    let deepest = 0;
    for (let x = -1500; x < 250; x += 25) for (let z = -1200; z < 3000; z += 25) {
      if (!inWater(x, z) || projectToTrack(track, x, z, -1, tp) === undefined) continue;
      if (Math.abs(tp.d) > 40) deepest = Math.min(deepest, terrain.heightAt(x, z));
    }
    expect(deepest).toBeLessThan(-0.8);
    terrain.dispose();
  });

  it('releases generated resources once and leaves the next build intact', () => {
    const track = createGoldCoastTrack(), first = buildGoldCoastTerrain(track, 'high'), next = buildGoldCoastTerrain(track, 'low');
    const mesh = first.group.children.find(o => o instanceof THREE.Mesh) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const sea = first.group.getObjectByName('gold-coast-sea') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const materialDispose = vi.spyOn(mesh.material, 'dispose');
    const mapDispose = vi.spyOn(mesh.material.normalMap!, 'dispose');
    const seaDispose = vi.spyOn(sea.material, 'dispose');
    first.dispose(); first.dispose();
    expect(materialDispose).toHaveBeenCalledOnce(); expect(mapDispose).toHaveBeenCalledOnce(); expect(seaDispose).toHaveBeenCalledOnce();
    expect(next.group.children.length).toBeGreaterThan(0);
    expect(next.heightAt(0, 0)).toBeLessThan(0); next.dispose();
  });
});
