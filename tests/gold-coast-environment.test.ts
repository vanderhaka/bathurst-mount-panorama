import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGraphics } from '@/config/graphics';
import { createGoldCoastTrack } from '@/track/gold-coast';
import type { SpeedProfile } from '@/track/speed-profile';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import { CIRCUIT_WORLDS } from '@/world/circuit-world';
import { coastXAt, inSea, inWater, onIsland } from '@/world/gold-coast-geo';
import { goldCoastFootprintFits, goldCoastInfillSpecs, goldCoastPalmPlacements, goldCoastTowerSpecs, insideLap } from '@/world/gold-coast-layout';
import { buildGoldCoastScenery } from '@/world/gold-coast-scenery';
import { buildGoldCoastTerrain } from '@/world/gold-coast-terrain';
import type { Terrain } from '@/world/terrain';

// A CPU-only canvas stands in for the browser's, as in the tower tests.
function fakeCanvas() {
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const ctx = new Proxy({ canvas }, {
    get(target, key) {
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return key in target ? Reflect.get(target, key) : () => {};
    },
  });
  return canvas;
}

beforeEach(() => vi.stubGlobal('document', { createElement: fakeCanvas }));
afterEach(() => { resetGraphics(); vi.unstubAllGlobals(); });

const track = createGoldCoastTrack();
const profile: SpeedProfile = { speed: new Float32Array(track.n).fill(60), cornerLimit: new Float32Array(track.n).fill(60), lapTimeS: 90, topSpeed: 60 };
let low: Terrain, high: Terrain;
beforeAll(() => { low = buildGoldCoastTerrain(track, 'low'); high = buildGoldCoastTerrain(track, 'high'); }, 60000);
afterAll(() => { low.dispose(); high.dispose(); });

describe('Gold Coast skyline, infill and palms', { timeout: 60000 }, () => {
  it('places the OSM towers deterministically, Q1 included, all clear of road, sea and water', () => {
    const towers = goldCoastTowerSpecs(track, high, 'high');
    expect(goldCoastTowerSpecs(track, high, 'high')).toEqual(towers);
    expect(towers.length).toBeGreaterThanOrEqual(100);
    const q1 = towers.find(t => Math.hypot(t.x - 291, t.z - 2289.2) < 1);
    expect(q1).toBeDefined(); expect(Math.abs(q1!.height - 323)).toBeLessThanOrEqual(1);
    for (const t of towers) {
      expect(goldCoastFootprintFits(high, t, 4)).toBe(true);
      expect(inSea(t.x, t.z) || inWater(t.x, t.z)).toBe(false);
    }
  });

  it('keeps fewer towers on low than on high', () => {
    expect(goldCoastTowerSpecs(track, low, 'low').length).toBeLessThanOrEqual(goldCoastTowerSpecs(track, high, 'high').length);
  });

  it('adds street infill outside the lap, off the beachfront and clear of the towers', () => {
    const towers = goldCoastTowerSpecs(track, high, 'high'), infill = goldCoastInfillSpecs(track, high, 'high', towers);
    expect(infill.length).toBeGreaterThanOrEqual(25);
    expect(goldCoastInfillSpecs(track, low, 'low', towers)).toHaveLength(0);
    for (const b of infill) {
      expect(insideLap(track, b.x, b.z)).toBe(false);
      const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
      for (const [a, d] of [[0, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const u = a * b.width / 2, v = d * b.depth / 2;
        expect(onIsland(b.x + c * u + s * v, b.z - s * u + c * v)).toBe(false);
      }
      expect(b.x).toBeLessThanOrEqual(coastXAt(b.z) - 120);
      for (const t of towers) expect(Math.hypot(t.x - b.x, t.z - b.z)).toBeGreaterThanOrEqual(25);
    }
  });

  it('plants palms on land, outside the walls, with a median along the pit straight', () => {
    const palms = goldCoastPalmPlacements(track, high, 'high'), tp = createTrackPoint();
    expect(palms.length).toBeGreaterThanOrEqual(150);
    expect(palms.every(p => p.kind === 'palm')).toBe(true);
    let median = 0;
    for (const p of palms) {
      expect(high.clearance(p.x, p.z)).toBeGreaterThanOrEqual(1.5);
      expect(inSea(p.x, p.z) || inWater(p.x, p.z)).toBe(false);
      projectToTrack(track, p.x, p.z, -1, tp);
      if (tp.d > 12 && tp.d < 14.5 && (tp.s <= 290 || tp.s >= track.length - 295)) median++;
    }
    expect(median).toBeGreaterThanOrEqual(20);
  });
});

describe('Gold Coast scenery assembly', { timeout: 60000 }, () => {
  it('builds the low-tier set pieces and releases the towers once', () => {
    const scenery = buildGoldCoastScenery(track, low, profile, 'low');
    const g = scenery.group;
    for (const name of ['gold-coast-towers', 'start-lights', 'gold-coast-finish-grandstand']) expect(g.getObjectByName(name), name).toBeDefined();
    expect(g.children.filter(o => o.name.startsWith('gold-coast-pit-garages-')).length).toBeGreaterThanOrEqual(2);
    const gantry = g.getObjectByName('start-gantry')!, grid: [number, number, number] = [0, 0, 0], gi = Math.floor(track.gridLineS / track.spacing);
    pointAt(track, track.gridLineS, (track.left.wall[gi] - track.right.wall[gi]) / 2, grid);
    expect(Math.hypot(gantry.position.x - grid[0], gantry.position.z - grid[2])).toBeLessThan(0.01);
    let meshes = 0;
    g.traverse(o => { if (o instanceof THREE.Mesh) meshes++; });
    expect(meshes).toBeLessThan(80);
    const towers = g.getObjectByName('gold-coast-towers')!;
    const dispose = vi.spyOn(towers.userData, 'dispose');
    const material = (towers.children[0] as THREE.Mesh).material as THREE.Material;
    const materialDispose = vi.spyOn(material, 'dispose');
    scenery.update(new THREE.Vector3(0, 3, 0));
    scenery.dispose(); scenery.dispose();
    expect(dispose).toHaveBeenCalledOnce(); expect(materialDispose).toHaveBeenCalledOnce();
  });

  it('is wired as the gold-coast world', async () => {
    const terrain = await CIRCUIT_WORLDS['gold-coast'].terrain(track, 'low');
    expect(terrain.group.getObjectByName('gold-coast-sea')).toBeDefined();
    terrain.dispose();
  });
});
