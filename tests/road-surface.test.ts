import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE, type SpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';
import { generateAsphaltMaps, generateWeatherMap } from '@/world/asphalt-maps';
import { buildKerbGeometry, kerbProfileHeight } from '@/world/kerb-surface';
import { buildRoad } from '@/world/road';
import { brakingSkidStrength, buildWallScuffs, WALL_SCUFF_ZONES } from '@/world/road-marks';
import { buildStrip } from '@/world/strip';

const track = new Track();
const line = computeRacingLine(track);
const profile = computeSpeedProfile(track, line, CAR_SPECS.camaro, LINE_PROFILE);
const renderer = { capabilities: { getMaxAnisotropy: () => 8 } } as unknown as THREE.WebGLRenderer;

function expectSeamless(data: Uint8Array, size: number): void {
  for (let i = 0; i < size; i++) for (let c = 0; c < 4; c++) {
    expect(data[(i * size) * 4 + c]).toBe(data[(i * size + size - 1) * 4 + c]);
    expect(data[i * 4 + c]).toBe(data[((size - 1) * size + i) * 4 + c]);
  }
}

describe('generated asphalt', () => {
  it('tiles colour, normal, roughness and weather maps without an edge seam', () => {
    const maps = generateAsphaltMaps(64);
    for (const data of [maps.albedo, maps.normal, maps.roughness, generateWeatherMap(64)]) expectSeamless(data, 64);
    expect(generateAsphaltMaps(64)).toEqual(maps);
    expect(maps.meanLinear).toBeGreaterThan(0.25);
    expect(maps.meanLinear).toBeLessThan(0.6);
  });

  it('has predominantly rough dry asphalt and small unit tangent-space normals', () => {
    const { normal, roughness } = generateAsphaltMaps(128);
    let lo = 255, hi = 0;
    for (let i = 0; i < 128 * 128; i++) {
      lo = Math.min(lo, roughness[i * 4 + 1]);
      hi = Math.max(hi, roughness[i * 4 + 1]);
      const n = [0, 1, 2].map((c) => normal[i * 4 + c] / 127.5 - 1);
      expect(Math.hypot(...n)).toBeCloseTo(1, 2);
      expect(n[2]).toBeGreaterThan(0.85);
    }
    expect(lo / 255).toBeGreaterThan(0.7);
    expect(hi - lo).toBeGreaterThan(12);
  });

  it('creates sparse sealed cracks and a separate repair mask', () => {
    const data = generateWeatherMap(256);
    let cracks = 0, repairs = 0;
    for (let i = 0; i < 256 * 256; i++) {
      cracks += data[i * 4 + 1] > 80 ? 1 : 0;
      repairs += data[i * 4] > 128 ? 1 : 0;
    }
    expect(cracks).toBeGreaterThan(30);
    expect(cracks / (256 * 256)).toBeLessThan(0.12);
    expect(repairs / (256 * 256)).toBeGreaterThan(0.025);
    expect(repairs / (256 * 256)).toBeLessThan(0.4);
  });

  it('keeps metre-based UVs continuous when a kerb or mark crosses the lap seam', () => {
    const geo = buildStrip(track, {
      from: () => -1, to: () => 1, segments: 1,
      include: (i) => i < 3 || i >= track.n - 3,
    });
    const uv = geo.getAttribute('uv');
    for (let v = 2; v < uv.count; v += 2) expect(uv.getY(v) - uv.getY(v - 2)).toBeCloseTo(track.spacing, 3);
    expect(uv.getY(uv.count - 1)).toBeGreaterThan(track.length);
    geo.dispose();
  });
});

describe('kerbs', () => {
  it('places a two-metre inside T21 kerb and keeps every kerb clear of the barrier', () => {
    const kerbs = placeKerbs(track, line);
    const chase = track.corners.find((c) => c.turn === 21)!;
    const i = Math.round(chase.s / track.spacing);
    expect(kerbs.left[i]).toBeCloseTo(2, 1);
    for (let k = 0; k < track.n; k++) {
      expect(kerbs.left[k]).toBeLessThanOrEqual(Math.max(0, track.left.wall[k] - track.left.edge[k] - 0.3) + 1e-5);
      expect(kerbs.right[k]).toBeLessThanOrEqual(Math.max(0, track.right.wall[k] - track.right.edge[k] - 0.3) + 1e-5);
    }
  });

  it('has a raised road-side lip, a lower outside edge and a ramp at the run ends', () => {
    expect(kerbProfileHeight(0.25, 2)).toBeGreaterThan(0.055);
    expect(kerbProfileHeight(0.25, 2)).toBeLessThan(0.09);
    expect(kerbProfileHeight(1, 2)).toBeLessThan(kerbProfileHeight(0.25, 2));
    expect(kerbProfileHeight(0, 2)).toBeLessThan(0.01);
    expect(kerbProfileHeight(0.25, 0.08)).toBeLessThan(0.02);
    const apex = Math.round(5588 / track.spacing);
    const wide = new Float32Array(track.n);
    wide.fill(2, apex - 5, apex + 6);
    const atChase = buildKerbGeometry(track, line, wide, 1, 0.7);
    const lip = atChase.getAttribute('position').getY(5 * 9 + 2);
    expect(lip - heightAt(track, apex, 0, track.left.edge[apex])).toBeCloseTo(0.065, 4);
    atChase.dispose();
    const kerbs = placeKerbs(track, line);
    for (const [widths, sign] of [[kerbs.left, 1], [kerbs.right, -1]] as const) {
      const geo = buildKerbGeometry(track, line, widths, sign, 0.7);
      const position = geo.getAttribute('position');
      expect(position.count).toBeGreaterThan(500);
      expect(geo.getAttribute('uv').count).toBe(position.count);
      for (const n of position.array) expect(Number.isFinite(n)).toBe(true);
      geo.dispose();
    }
  });
});

describe('rubber and braking marks', () => {
  it('uses profile braking demand and leaves a constant-speed straight unmarked', () => {
    const steady: SpeedProfile = { ...profile, speed: new Float32Array(track.n).fill(70) };
    expect(brakingSkidStrength(track, line, steady).every((v) => v === 0)).toBe(true);
    const strengths = brakingSkidStrength(track, line, profile);
    const sumBetween = (from: number, to: number) => strengths.slice(Math.ceil(from / track.spacing), Math.floor(to / track.spacing)).reduce((a, b) => a + b, 0);
    expect(sumBetween(5400, 5580)).toBeGreaterThan(1);
    expect(sumBetween(4500, 5000)).toBe(0);
    // A braking zone can cross the lap seam.
    const wrapped: SpeedProfile = { ...steady, speed: Float32Array.from(steady.speed) };
    wrapped.speed.fill(30, 0, 8);
    expect(brakingSkidStrength(track, line, wrapped)[track.n - 3]).toBeGreaterThan(0.1);
  });

  it('builds scuffs on the three outside walls close to the barrier face', () => {
    expect(WALL_SCUFF_ZONES.map((z) => z.name)).toEqual(['The Chase', "Murray's Corner", "Forrest's Elbow"]);
    const geo = buildWallScuffs(track);
    const p = geo.getAttribute('position');
    expect(p.count).toBeGreaterThan(30);
    expect(geo.getAttribute('color').itemSize).toBe(4);
    for (let v = 0; v < p.count; v++) {
      const i = track.nearestIndex(p.getX(v), p.getZ(v));
      const d = (p.getX(v) - track.px[i]) * track.lx[i] + (p.getZ(v) - track.pz[i]) * track.lz[i];
      expect(Math.abs(d) - track.right.wall[i]).toBeLessThan(0.2);
      expect(Math.abs(d) - track.right.wall[i]).toBeGreaterThan(-0.15);
    }
    geo.dispose();
  });

  it('keeps the groove on the racing line, closes texture repeats and owns its GPU resources', () => {
    const group = buildRoad(track, line, placeKerbs(track, line), renderer, { detailSize: 64, rubberGroove: 0.8, profile });
    const road = group.getObjectByName('road-surface') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const rubber = road.geometry.getAttribute('roadRubber');
    expect(Math.max(...rubber.array)).toBeGreaterThan(0.7);
    expect(Math.min(...rubber.array)).toBeLessThan(0.01);
    const uv = road.geometry.getAttribute('uv');
    expect((uv.getY(uv.count - 1) - uv.getY(0)) * road.material.map!.repeat.y).toBeCloseTo(Math.round(track.length / 4), 3);
    expect(road.material.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(road.material.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(road.material.map!.generateMipmaps).toBe(true);
    const disposed = vi.fn();
    road.material.map!.addEventListener('dispose', disposed);
    road.geometry.dispose();
    road.geometry.dispose();
    expect(disposed).toHaveBeenCalledTimes(1);
    group.traverse((o) => { if (o instanceof THREE.Mesh && o !== road) o.geometry.dispose(); });
  });

  it('can omit costly surface maps while retaining worn paint and a smooth groove', () => {
    const group = buildRoad(track, line, placeKerbs(track, line), renderer, { detailSize: 64, surfaceDetail: false, repairStrength: 0, skids: false });
    const road = group.getObjectByName('road-surface') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    expect(road.material.normalMap).toBeNull();
    expect(road.material.roughnessMap).toBeNull();
    expect(group.getObjectByName('wall-tyre-scuffs')).toBeUndefined();
    const paint = group.getObjectByName('edge-line-left') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    const pixels = (paint.material.map!.image as { data: Uint8Array }).data;
    expect(pixels.some((v, i) => i % 4 === 3 && v === 0)).toBe(true);
    group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  });
});
