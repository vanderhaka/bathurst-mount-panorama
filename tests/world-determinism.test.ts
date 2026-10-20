import * as THREE from 'three';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGraphics } from '@/config/graphics';
import { createAdelaideTrack } from '@/track/adelaide';
import { createGoldCoastTrack } from '@/track/gold-coast';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import type { SpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { buildAdelaideScenery, buildAdelaideScenerySteps } from '@/world/adelaide-scenery';
import { buildAdelaideTerrain, buildAdelaideTerrainSteps } from '@/world/adelaide-terrain';
import { runCooperative } from '@/world/cooperative';
import { buildGoldCoastScenery } from '@/world/gold-coast-scenery';
import { buildGoldCoastTerrain } from '@/world/gold-coast-terrain';
import { buildRoad } from '@/world/road';
import { buildScenery } from '@/world/scenery';
import { buildTerrain } from '@/world/terrain';

// A CPU-only canvas stands in for the browser's.
function fakeCanvas() {
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const ctx = new Proxy({ canvas }, {
    get(target, key) {
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (key === 'measureText') return (text: string) => ({ width: text.length * 10 });
      return key in target ? Reflect.get(target, key) : () => {};
    },
  });
  return canvas;
}

const FIXTURE = new URL('./fixtures/world-fingerprint.json', import.meta.url);
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer;

// x64 and arm64 libm can disagree on the sign and last bits of results that
// should be exactly zero (around 1e-18), so treat those as zero.
const NOISE_FLOOR = 1e-9;

function hashFloats(array: ArrayLike<number>): string {
  let h = 2166136261 >>> 0;
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  for (let i = 0; i < array.length; i++) {
    f[0] = Math.abs(array[i]) < NOISE_FLOOR ? 0 : array[i];
    h = Math.imul(h ^ u[0], 16777619) >>> 0;
  }
  return h.toString(16);
}

/** Structure, vertex data and instance matrices of every drawable in a group, in traversal order. */
function fingerprint(group: THREE.Object3D): string[] {
  group.updateMatrixWorld(true);
  const out: string[] = [];
  group.traverse((o) => {
    const parts = [o.type, o.name, o.children.length, hashFloats(o.matrix.elements)];
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) {
      const g = mesh.geometry as THREE.BufferGeometry, p = g.getAttribute('position');
      parts.push(p?.count ?? 0, p ? hashFloats(p.array as Float32Array) : '-', g.index?.count ?? 0);
    }
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) parts.push(inst.count, hashFloats(inst.instanceMatrix.array.subarray(0, inst.count * 16)));
    out.push(parts.join('|'));
  });
  return out;
}

function profile(n: number): SpeedProfile {
  return { speed: new Float32Array(n).fill(60), cornerLimit: new Float32Array(n).fill(60), lapTimeS: 90, topSpeed: 60 };
}

function fixture(): Record<string, string[]> {
  return existsSync(FIXTURE) ? JSON.parse(readFileSync(FIXTURE, 'utf8')) : {};
}

const results: Record<string, string[]> = {};
function check(name: string, actual: string[]): void {
  results[name] = actual;
  if (process.env.WRITE_WORLD_FINGERPRINT) {
    writeFileSync(FIXTURE, JSON.stringify({ ...fixture(), ...results }, null, 1));
    return;
  }
  const expected = fixture()[name];
  expect(expected, `no stored fingerprint for ${name}`).toBeDefined();
  expect(actual.length).toBe(expected.length);
  expect(actual).toEqual(expected);
}

describe('world build determinism', () => {
  beforeEach(() => vi.stubGlobal('document', { createElement: fakeCanvas }));
  afterEach(() => { resetGraphics(); vi.unstubAllGlobals(); });

  it('bathurst road, terrain and scenery come out identical', () => {
    const track = new Track(), line = computeRacingLine(track);
    check('bathurst-road', fingerprint(buildRoad(track, line, placeKerbs(track, line), renderer, { detailSize: 64, skids: false })));
    const terrain = buildTerrain(track, undefined, 'high');
    check('bathurst-terrain', fingerprint(terrain.group));
    check('bathurst-scenery', fingerprint(buildScenery(track, terrain, profile(track.n), 'high').group));
  }, 120_000);

  it('adelaide terrain and scenery come out identical', () => {
    const track = createAdelaideTrack(), terrain = buildAdelaideTerrain(track, 'high');
    check('adelaide-terrain', fingerprint(terrain.group));
    check('adelaide-scenery', fingerprint(buildAdelaideScenery(track, terrain, profile(track.n), 'high').group));
  }, 120_000);

  it('gold coast terrain and scenery come out identical', () => {
    const track = createGoldCoastTrack(), terrain = buildGoldCoastTerrain(track, 'high');
    check('gold-coast-terrain', fingerprint(terrain.group));
    check('gold-coast-scenery', fingerprint(buildGoldCoastScenery(track, terrain, profile(track.n), 'high').group));
  }, 120_000);

  it('builds the same adelaide world when run in time slices, reporting progress as it goes', async () => {
    const track = createAdelaideTrack(), reports: Array<[number, string]> = [];
    const progress = (fraction: number, label: string) => { reports.push([fraction, label]); };
    const terrain = await runCooperative(buildAdelaideTerrainSteps(track, 'high'), progress, 0.55, 0.7, 'terrain');
    const scenery = await runCooperative(buildAdelaideScenerySteps(track, terrain, profile(track.n), 'high'), progress, 0.7, 0.95, 'scenery');
    check('adelaide-terrain', fingerprint(terrain.group));
    check('adelaide-scenery', fingerprint(scenery.group));
    expect(reports.length).toBeGreaterThan(2);
    expect(reports.some(([, label]) => label === 'terrain')).toBe(true);
    expect(reports.some(([, label]) => label === 'scenery')).toBe(true);
    for (const [fraction, label] of reports) {
      expect(fraction).toBeGreaterThanOrEqual(label === 'terrain' ? 0.55 : 0.7);
      expect(fraction).toBeLessThanOrEqual(label === 'terrain' ? 0.7 : 0.95);
    }
    const fractions = reports.map(([f]) => f);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  }, 120_000);
});
