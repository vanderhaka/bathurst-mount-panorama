import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import coordinates from '@/track/data/adelaide.json';
import { resetGraphics } from '@/config/graphics';
import { Track, type TrackSource } from '@/track/track-model';
import { createAdelaideTrack } from '@/track/adelaide';
import { heightAt, pointAt } from '@/track/track-query';
import type { SpeedProfile } from '@/track/speed-profile';
import { adelaideCityPlacements, adelaideFootprintFits, adelaideTreePlacements } from '@/world/adelaide-layout';
import { buildAdelaideTerrain } from '@/world/adelaide-terrain';
import { buildAdelaideScenery } from '@/world/adelaide-scenery';

afterEach(resetGraphics);

/** Uniform sampling keeps this geometry fixture independent of the runtime data builder. */
function adelaideTrack(): Track {
  const ring = coordinates.points;
  const chain = [0];
  for (let i = 1; i < ring.length; i++) chain.push(chain[i - 1] + Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]));
  const points: number[][] = [];
  let segment = 0;
  for (let i = 0; i < 640; i++) {
    const s = chain.at(-1)! * i / 640;
    while (chain[segment + 1] < s) segment++;
    const u = (s - chain[segment]) / (chain[segment + 1] - chain[segment]);
    points.push([ring[segment][0] + (ring[segment + 1][0] - ring[segment][0]) * u, 0,
      ring[segment][1] + (ring[segment + 1][1] - ring[segment][1]) * u]);
  }
  const source: TrackSource = { meta: { id: 'adelaide', lengthM: 3219, elevationBaseM: 0, elevationMinM: 0, elevationMaxM: 0,
    finishLineS: 0, startLineS: 0 }, points, sections: [], corners: [] };
  const track = new Track(source);
  track.bank.fill(0);
  for (const side of [track.left, track.right]) { side.edge.fill(6); side.wall.fill(9); }
  return track;
}

function profile(track: Track): SpeedProfile {
  return { speed: new Float32Array(track.n).fill(60), cornerLimit: new Float32Array(track.n).fill(60), lapTimeS: 90, topSpeed: 60 };
}

describe('Adelaide street and parkland surroundings', () => {
  it.each(['low', 'medium', 'high'] as const)('keeps the %s rendered ground below the road and verges, including corners', quality => {
    const track = createAdelaideTrack(), terrain = buildAdelaideTerrain(track, quality);
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
    expect(terrain.heightAt(500, 500)).toBeGreaterThan(-1);
    expect(terrain.heightAt(500, 500)).toBeLessThan(0.1);
    expect(terrain.grass.mesh !== undefined).toBe(quality === 'high');
    for (const name of ['adelaide-street-paving', 'adelaide-pit-apron']) {
      const geometry = (terrain.group.getObjectByName(name) as THREE.Mesh).geometry;
      const normal = geometry.getAttribute('normal');
      expect(normal.count).toBeGreaterThan(0);
      for (let i = 0; i < normal.count; i++) expect(normal.getY(i)).toBeGreaterThan(0.98);
    }
    terrain.dispose();
  });

  it('checks the interior of a footprint as well as its corners before placing a building', () => {
    const terrain = buildAdelaideTerrain(adelaideTrack(), 'low');
    const clear = { x: -950, z: -700, width: 24, depth: 16, yaw: 0 };
    expect(adelaideFootprintFits(terrain, clear, 3)).toBe(true);
    // All four corners are outside the narrow corridor, but the rectangle spans the finish straight.
    expect(adelaideFootprintFits(terrain, { x: 0, z: 0, width: 90, depth: 90, yaw: 0 }, 3)).toBe(false);
    terrain.dispose();
  });

  it('places deterministic city façades outside barriers and keeps Victoria Park open', () => {
    const track = adelaideTrack(), terrain = buildAdelaideTerrain(track, 'low');
    const city = adelaideCityPlacements(track, terrain, 'high');
    expect(city).toEqual(adelaideCityPlacements(track, terrain, 'high'));
    expect(city.length).toBeGreaterThan(25);
    expect(city.some(p => p.heritage)).toBe(true);
    expect(city.some(p => p.height > 30)).toBe(true);
    for (const p of city) {
      expect(adelaideFootprintFits(terrain, p, 2)).toBe(true);
      expect(p.x < -530 || p.z < -570).toBe(true);
      expect(p.x - p.width / 2).toBeGreaterThan(terrain.box.x0);
      expect(p.z - p.depth / 2).toBeGreaterThan(terrain.box.z0);
    }
    const trees = adelaideTreePlacements(track, terrain, 'high');
    expect(trees.length).toBeGreaterThan(50);
    for (const p of trees) expect(terrain.clearance(p.x, p.z)).toBeGreaterThan(p.radius + 1.5);
    // The central lawn remains visibly open rather than becoming Bathurst woodland.
    expect(trees.filter(p => p.x > -440 && p.x < -170 && p.z > -390 && p.z < -130).length).toBeLessThan(8);
    terrain.dispose();
  });

  it('releases generated ground resources once and leaves the next quality build intact', () => {
    const track = adelaideTrack(), first = buildAdelaideTerrain(track, 'high'), next = buildAdelaideTerrain(track, 'low');
    const mesh = first.group.children.find(o => o instanceof THREE.Mesh) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const materialDispose = vi.spyOn(mesh.material, 'dispose');
    const mapDispose = vi.spyOn(mesh.material.normalMap!, 'dispose');
    first.dispose(); first.dispose();
    expect(materialDispose).toHaveBeenCalledOnce(); expect(mapDispose).toHaveBeenCalledOnce();
    expect(next.group.children.length).toBeGreaterThan(0);
    expect(next.heightAt(0, 0)).toBeLessThan(0); next.dispose();
  });

  it('owns independent gum batches, start lights and bounded generated structures across tier rebuilds', () => {
    const track = createAdelaideTrack(), ground = buildAdelaideTerrain(track, 'low');
    const first = buildAdelaideScenery(track, ground, profile(track), 'low');
    const next = buildAdelaideScenery(track, ground, profile(track), 'medium');
    expect(first.stats.trees).toBeGreaterThan(30);
    expect(first.stats.batches).toBeLessThan(10);
    expect(first.group.getObjectByName('start-lights')).toBeDefined();
    const gantry = first.group.getObjectByName('start-gantry')!;
    const grid: [number, number, number] = [0, 0, 0], gi = Math.floor(track.gridLineS / track.spacing);
    pointAt(track, track.gridLineS, (track.left.wall[gi] - track.right.wall[gi]) / 2, grid);
    expect(Math.hypot(gantry.position.x - grid[0], gantry.position.z - grid[2])).toBeLessThan(0.01);
    expect(first.group.getObjectByName('adelaide-pit-pavilion')).toBeDefined();
    expect(first.group.getObjectByName('adelaide-finish-grandstand')).toBeDefined();
    let meshCount = 0;
    first.group.traverse(o => { if (o instanceof THREE.Mesh) meshCount++; });
    expect(meshCount).toBeLessThan(55);
    const batch = first.group.getObjectByName('props-batch-0') as THREE.BatchedMesh;
    const material = batch.material as THREE.MeshStandardMaterial;
    const dispose = vi.spyOn(material, 'dispose');
    const gpuDispose = vi.spyOn(batch, 'dispose');
    first.update(new THREE.Vector3(0, 3, 0)); first.dispose(); first.dispose();
    expect(dispose).toHaveBeenCalledOnce(); expect(gpuDispose).toHaveBeenCalledOnce();
    expect(next.group.children.length).toBeGreaterThan(0); next.update(new THREE.Vector3(0, 3, 0));
    next.dispose(); ground.dispose();
  });
});
