import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Track } from '@/track/track-model';
import { applyTerrainAlbedoRatio, createTerrainSurfaceSampler, mownStripe, prepareTerrainGeometry, terrainSplat, terrainSurfaceColour } from '@/world/terrain-surface';

const sample = { x: 100, z: 200, height: 40, normalY: 1, trackDistance: 20, lateral: 25, clearance: 15 };

describe('terrain surface blending', () => {
  it('keeps the five surface weights finite, positive and normalised', () => {
    for (const normalY of [1, 0.96, 0.8, 0.4]) for (const height of [-20, 50, 200]) {
      for (const trackDistance of [-5, 0, 2, 15, Infinity]) {
        const weights = Object.values(terrainSplat({ ...sample, normalY, height, trackDistance }));
        expect(weights.every(w => Number.isFinite(w) && w >= 0 && w <= 1)).toBe(true);
        expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      }
    }
  });

  it('exposes rock on steep slopes, clay on banks and gravel at the shoulder', () => {
    const flat = terrainSplat(sample);
    const bank = terrainSplat({ ...sample, normalY: 0.88 });
    const steep = terrainSplat({ ...sample, normalY: 0.55 });
    const shoulder = terrainSplat({ ...sample, trackDistance: 0.5 });
    expect(bank.clay).toBeGreaterThan(flat.clay);
    expect(steep.rock).toBeGreaterThan(0.75);
    expect(shoulder.gravel).toBeGreaterThan(flat.gravel);
    expect(flat.green + flat.dry).toBeGreaterThan(0.9);
  });

  it('uses height and world coordinates without changing the palette twice', () => {
    expect(terrainSplat({ ...sample, height: 200 }).dry).toBeGreaterThan(terrainSplat(sample).dry);
    const colour = new THREE.Color();
    expect(terrainSurfaceColour(sample, colour)).toBe(colour);
    expect([colour.r, colour.g, colour.b].every(v => v > 0 && v < 1)).toBe(true);
    const other = terrainSurfaceColour({ ...sample, x: 457, z: -311 }, new THREE.Color());
    expect(other.equals(colour)).toBe(false);
  });

  it('refines albedo by a ratio while preserving already baked AO per channel', () => {
    const base = new THREE.Color().setRGB(0.2, 0.3, 0.15);
    const baked = base.clone().multiply(new THREE.Color().setRGB(0.5, 0.7, 0.4));
    const refined = terrainSurfaceColour(sample, new THREE.Color());
    expect(applyTerrainAlbedoRatio(baked, base, refined, baked)).toBe(baked);
    expect(baked.r / refined.r).toBeCloseTo(0.5, 12);
    expect(baked.g / refined.g).toBeCloseTo(0.7, 12);
    expect(baked.b / refined.b).toBeCloseTo(0.4, 12);
    const black = new THREE.Color().setRGB(0, 0, 0);
    expect(applyTerrainAlbedoRatio(black, black, refined, black).toArray()).toEqual([0, 0, 0]);
  });

  it('mows parallel strips only near the track and fades them smoothly', () => {
    expect(mownStripe(0, 2)).not.toBeCloseTo(mownStripe(1.8, 2), 5);
    expect(mownStripe(0, 100)).toBe(1);
    expect(mownStripe(0, -1)).toBe(1);
    expect(Math.abs(mownStripe(0, 10) - 1)).toBeLessThan(Math.abs(mownStripe(0, 2) - 1));
  });

  it('samples both verges correctly after camera jumps between distant track positions', () => {
    const track = new Track(), height = (x: number, z: number) => 0.01 * x + 0.02 * z;
    const surface = createTerrainSurfaceSampler(track, height);
    for (const i of [40, 1200, 400, 900]) {
      const road = surface(track.px[i], track.pz[i]);
      expect(road.trackDistance).toBeLessThan(-4);
      expect(road.clearance).toBeLessThan(0);
      for (const sign of [-1, 1]) {
        const side = sign > 0 ? track.left : track.right, d = (side.wall[i] + 3) * sign;
        const x = track.px[i] + track.lx[i] * d, z = track.pz[i] + track.lz[i] * d;
        const verge = surface(x, z);
        expect(verge.trackDistance).toBeGreaterThan(0);
        expect(verge.clearance).toBeGreaterThan(1.6);
        expect(verge.height).toBe(height(x, z));
        expect(verge.normalY).toBeCloseTo(1 / Math.sqrt(1.0005), 6);
      }
    }
  });

  it('smooths across chunk edges without changing height geometry or AO colours', () => {
    const height = (x: number, z: number) => 3 * x + 2 * z;
    const make = (x0: number) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([x0, height(x0, 0), 0, x0 + 6, height(x0 + 6, 0), 0], 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute([0.2, 0.3, 0.4, 0.2, 0.3, 0.4], 3));
      return geometry;
    };
    const a = make(0), b = make(6);
    const original = Array.from(a.getAttribute('position').array);
    const originalColours = Array.from(a.getAttribute('color').array);
    prepareTerrainGeometry(a, height, (x, z) => ({ ...sample, x, z, height: height(x, z) }));
    prepareTerrainGeometry(b, height);
    expect(Array.from(a.getAttribute('position').array)).toEqual(original);
    expect(Array.from(a.getAttribute('color').array)).toEqual(originalColours);
    expect(a.getAttribute('normal').getX(1)).toBeCloseTo(b.getAttribute('normal').getX(0), 8);
    expect(a.getAttribute('normal').getY(1)).toBeCloseTo(1 / Math.sqrt(14), 6);
    expect(a.getAttribute('uv').getX(1)).toBe(b.getAttribute('uv').getX(0));
    expect(a.getAttribute('terrainCover').getX(0)).toBeCloseTo(1, 6);
    expect(a.getAttribute('terrainCover').getY(0)).toBe(sample.trackDistance);
    expect(a.getAttribute('terrainCover').getZ(0)).toBe(sample.lateral);
    expect(b.getAttribute('terrainCover').getX(0)).toBe(0);
  });
});
