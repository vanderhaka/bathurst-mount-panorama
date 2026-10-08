import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGraphics } from '@/config/graphics';
import { buildFootBridge } from '@/props/structures/foot-bridge';
import { createGoldCoastTrack } from '@/track/gold-coast';
import type { SpeedProfile } from '@/track/speed-profile';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import { GOLD_COAST_TRACKSIDE, transitDistance } from '@/world/gold-coast-geo';
import { goldCoastInfillSpecs, goldCoastTowerSpecs } from '@/world/gold-coast-layout';
import { buildGoldCoastScenery } from '@/world/gold-coast-scenery';
import { buildGoldCoastTerrain } from '@/world/gold-coast-terrain';
import { PropInstancer } from '@/world/scenery/instancer';
import type { Scenery } from '@/world/scenery';
import type { Terrain } from '@/world/terrain';

// A CPU-only canvas stands in for the browser's, as in the environment tests.
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

const track = createGoldCoastTrack();
const profile: SpeedProfile = { speed: new Float32Array(track.n).fill(60), cornerLimit: new Float32Array(track.n).fill(60), lapTimeS: 90, topSpeed: 60 };
/** Vertex count of buildFootBridge({ span: 22, clearance: 5.6 }) recorded before the stairs option existed. */
const BATHURST_BRIDGE_VERTICES = 5748;
let terrain: Terrain, scenery: Scenery;
const placed: Array<{ kind: string; x: number; z: number }> = [];

beforeEach(() => vi.stubGlobal('document', { createElement: fakeCanvas }));
afterEach(() => { resetGraphics(); vi.unstubAllGlobals(); });
beforeAll(() => {
  vi.stubGlobal('document', { createElement: fakeCanvas });
  terrain = buildGoldCoastTerrain(track, 'high');
  const add = PropInstancer.prototype.add;
  const spy = vi.spyOn(PropInstancer.prototype, 'add').mockImplementation(function (this: PropInstancer, ...args: Parameters<PropInstancer['add']>) {
    placed.push({ kind: args[0], x: args[2], z: args[4] });
    return add.apply(this, args);
  });
  scenery = buildGoldCoastScenery(track, terrain, profile, 'high');
  spy.mockRestore();
  vi.unstubAllGlobals();
}, 120000);
afterAll(() => { scenery.dispose(); terrain.dispose(); });

/** World-space vertices of every mesh under an object. */
function worldVertices(o: THREE.Object3D): THREE.Vector3[] {
  o.updateWorldMatrix(true, true);
  const out: THREE.Vector3[] = [];
  o.traverse(m => {
    if (!(m instanceof THREE.Mesh)) return;
    const pos = m.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  return out;
}

describe('Gold Coast footbridges', { timeout: 60000 }, () => {
  const find = (id: string) => scenery.group.getObjectByName(`gold-coast-footbridge-${id}`)!;

  it('places A, C and D along their mapped ends, 5.6 m over the racing surface', () => {
    expect(GOLD_COAST_TRACKSIDE.footBridges.map(b => b.id)).toEqual(['A', 'C', 'D']);
    expect(scenery.group.userData.layout.footBridges).toBe(3);
    const surface: [number, number, number] = [0, 0, 0];
    for (const fb of GOLD_COAST_TRACKSIDE.footBridges) {
      const bridge = find(fb.id), [[ax, az], [bx, bz]] = fb.ends;
      expect(bridge, fb.id).toBeDefined();
      bridge.updateMatrixWorld(true);
      const axis = new THREE.Vector3(1, 0, 0).transformDirection(bridge.matrixWorld), want = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
      expect(THREE.MathUtils.radToDeg(axis.angleTo(want))).toBeLessThan(1);
      expect(Math.hypot(bridge.position.x - (ax + bx) / 2, bridge.position.z - (az + bz) / 2)).toBeLessThan(0.5);
      pointAt(track, fb.s, 0, surface);
      const hits = new THREE.Raycaster(new THREE.Vector3(surface[0], surface[1], surface[2]), new THREE.Vector3(0, 1, 0)).intersectObject(bridge, true);
      expect(hits.length, fb.id).toBeGreaterThan(0);
      expect(hits[0].distance).toBeGreaterThan(5.4); expect(hits[0].distance).toBeLessThan(6.2);
    }
  });

  it('keeps the skewed bridge D footprint within its deck length along X (stairs run along the track)', () => {
    const fb = GOLD_COAST_TRACKSIDE.footBridges.find(b => b.id === 'D')!, [[ax, az], [bx, bz]] = fb.ends;
    const L = Math.hypot(bx - ax, bz - az), axis = new THREE.Vector3(bx - ax, 0, bz - az).normalize();
    const u = worldVertices(find('D')).map(v => v.dot(axis));
    expect(Math.max(...u) - Math.min(...u)).toBeLessThanOrEqual(L + 1);
  });

  it('leaves the Bathurst bridge unchanged', () => {
    let n = 0;
    buildFootBridge({ span: 22, clearance: 5.6 }).traverse(o => { if (o instanceof THREE.Mesh) n += o.geometry.getAttribute('position').count; });
    expect(n).toBe(BATHURST_BRIDGE_VERTICES);
  });
});

describe('Gold Coast stands and transit clearances', { timeout: 60000 }, () => {
  const stand = (name: string) => scenery.group.getObjectByName(name === 'S14' ? 'gold-coast-finish-grandstand' : `gold-coast-grandstand-${name}`);

  it('stands S11-S14 in the pit-straight median, off the highway', () => {
    const tp = createTrackPoint();
    for (const name of ['S11', 'S12', 'S13', 'S14']) {
      const o = stand(name)!;
      expect(o, name).toBeDefined();
      projectToTrack(track, o.position.x, o.position.z, -1, tp);
      const wall = track.right.wall[Math.floor(tp.s / track.spacing)];
      expect(tp.d, name).toBeLessThanOrEqual(-(wall + 1.0)); expect(tp.d, name).toBeGreaterThanOrEqual(-(wall + 1.0 + 6.7));
      expect(transitDistance(o.position.x, o.position.z), name).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('keeps every placed stand out of the tram and highway corridors, and S19 beside the 2014 stand frames', () => {
    const layout = scenery.group.userData.layout.stands as { placed: string[]; skipped: string[] };
    for (const name of layout.placed) for (const v of worldVertices(stand(name)!)) expect(transitDistance(v.x, v.z), name).toBeGreaterThanOrEqual(0);
    expect(layout.placed).toContain('S19');
    const tp = createTrackPoint(), o = stand('S19')!;
    projectToTrack(track, o.position.x, o.position.z, -1, tp);
    expect(Math.abs(tp.s - 1306)).toBeLessThanOrEqual(2);
  });

  it('keeps palms, light poles, towers and infill off the transit corridors', () => {
    const small = placed.filter(p => p.kind === 'palm' || p.kind === 'lightPole');
    expect(small.length).toBeGreaterThan(100);
    for (const p of small) expect(transitDistance(p.x, p.z)).toBeGreaterThanOrEqual(0.5);
    const towers = goldCoastTowerSpecs(track, terrain, 'high');
    expect(towers.length).toBeGreaterThanOrEqual(100);
    expect(towers.some(t => Math.hypot(t.x - 291, t.z - 2289.2) < 1)).toBe(true);
    for (const t of [...towers, ...goldCoastInfillSpecs(track, terrain, 'high', towers)]) expect(transitDistance(t.x, t.z)).toBeGreaterThanOrEqual(0.5);
  });

  it('lays no right-hand footpath on the tram bed or the highway', () => {
    const mesh = terrain.group.getObjectByName('gold-coast-footpath-right') as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    for (let i = 0; i < pos.count; i++) expect(transitDistance(pos.getX(i), pos.getZ(i))).toBeGreaterThanOrEqual(0.2);
  });
});
