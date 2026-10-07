import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Track } from '@/track/track-model';
import { createTrackPoint, projectToTrack } from '@/track/track-query';
import { tracksidePlacements, wallImpactScuffs, TRACKSIDE_PROP_PRESETS } from '@/world/trackside-layout';
import { buildTracksideDetails, buildDetailCone } from '@/world/trackside-props';
import { distanceTownLayout, buildDistanceLandmarks, refineDistantHills, DISTANCE_DETAIL_PRESETS, BATHURST_TOWN } from '@/world/distance-landmarks';

describe('mapped trackside landmarks', () => {
  const track = new Track();
  const ground = { heightAt: () => 10, clearance: () => 100 };
  it('keeps every addition behind barriers and names the existing corner neighbourhood', () => {
    const places = tracksidePlacements(track, ground, TRACKSIDE_PROP_PRESETS.high);
    expect(new Set(places.map(p => p.kind))).toEqual(new Set(['flag', 'tower', 'cone', 'tyre']));
    const tp = createTrackPoint();
    for (const p of places) {
      projectToTrack(track, p.x, p.z, -1, tp);
      const side = tp.d >= 0 ? track.left : track.right;
      expect(Math.abs(tp.d) - side.wall[tp.index], p.label).toBeGreaterThan(p.radius);
      expect(p.y).toBe(10);
    }
    expect(places.some(p => p.label.includes('Skyline'))).toBe(true);
    expect(places.some(p => p.label.includes('Murray'))).toBe(true);
    expect(places.some(p => p.label.includes('Dipper'))).toBe(true);
    expect(wallImpactScuffs(track).length).toBeGreaterThan(3);
  });

  it('has tier switches, respects new-prop masks and is deterministic', () => {
    const high = tracksidePlacements(track, ground, TRACKSIDE_PROP_PRESETS.high);
    expect(high).toEqual(tracksidePlacements(track, ground, TRACKSIDE_PROP_PRESETS.high));
    expect(tracksidePlacements(track, ground, TRACKSIDE_PROP_PRESETS.low)).toHaveLength(0);
    const blocked = tracksidePlacements(track, ground, { ...TRACKSIDE_PROP_PRESETS.high, blocked: () => true });
    expect(blocked.filter(p => p.kind === 'cone' || p.kind === 'tyre')).toHaveLength(0);
    expect(tracksidePlacements(track, { heightAt: () => 10, clearance: () => -1 }, TRACKSIDE_PROP_PRESETS.high)).toHaveLength(0);
  });

  it('seats foundations at their lowest corner and skips footprints on steep banks', () => {
    const slope = { heightAt: (x: number, z: number) => x * 0.01 + z * 0.02, clearance: () => 100 };
    const placed = tracksidePlacements(track, slope, TRACKSIDE_PROP_PRESETS.high);
    expect(placed.length).toBeGreaterThan(20);
    for (const p of placed) expect(p.y).toBeLessThan(slope.heightAt(p.x, p.z));
    expect(tracksidePlacements(track, { heightAt: x => x * 4, clearance: () => 100 }, TRACKSIDE_PROP_PRESETS.high)).toHaveLength(0);
  });

  it('keeps the cone small and instances repeated assets instead of adding one draw per prop', () => {
    const cone = buildDetailCone();
    expect(cone.getAttribute('position').count / 3).toBeLessThanOrEqual(300);
    cone.computeBoundingBox();
    expect(cone.boundingBox!.min.y).toBeCloseTo(0);
    expect(cone.boundingBox!.max.y).toBeLessThan(0.8);
    cone.dispose();
    const details = buildTracksideDetails(tracksidePlacements(track, ground, TRACKSIDE_PROP_PRESETS.high), 0.02);
    expect(details.group.children.length).toBeLessThanOrEqual(8);
    let disposed = 0;
    details.group.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.addEventListener('dispose', () => disposed++);
        expect(child.geometry.getAttribute('color')).toBeDefined();
      }
    });
    const draws = details.group.children.length;
    details.update(12); details.setFlagMotion(0);
    details.dispose(); details.dispose();
    expect(disposed).toBe(draws);
  });
});

describe('distance landmarks grounded in the existing landscape', () => {
  const terrain = { heightAt: (x: number, z: number) => x * 0.001 - z * 0.001, box: { x0: -800, z0: -1450, x1: 1000, z1: 1200 } };
  it('bounds the town population and leaves the circuit and coarse street lanes open', () => {
    const houses = distanceTownLayout(terrain, { ...DISTANCE_DETAIL_PRESETS.high, maxHouses: 80 });
    expect(houses).toHaveLength(80);
    expect(houses).toEqual(distanceTownLayout(terrain, { ...DISTANCE_DETAIL_PRESETS.high, maxHouses: 80 }));
    expect(new Set(houses.map(p => `${p.x}:${p.z}`)).size).toBe(houses.length);
    for (const p of houses) {
      expect(Math.hypot(p.x - BATHURST_TOWN.x, p.z - BATHURST_TOWN.z)).toBeLessThan(BATHURST_TOWN.radius);
      expect(p.x < terrain.box.x0 - 60 || p.x > terrain.box.x1 + 60 || p.z < terrain.box.z0 - 60 || p.z > terrain.box.z1 + 60).toBe(true);
      expect(p.y).toBeCloseTo(terrain.heightAt(p.x, p.z));
      expect(p.height).toBeLessThanOrEqual(10);
      const dx = p.x - BATHURST_TOWN.x, dz = p.z - BATHURST_TOWN.z;
      const u = dx * Math.cos(0.38) + dz * Math.sin(0.38);
      expect(Math.abs(u - Math.round(u / 100) * 100)).toBeGreaterThanOrEqual(14 - 1e-8);
    }
    expect(distanceTownLayout(terrain, DISTANCE_DETAIL_PRESETS.low)).toHaveLength(0);
  });

  it('adds roof and plain silhouettes in two draws, with fog and a bounded triangle count', () => {
    const scenery = buildDistanceLandmarks(terrain, { ...DISTANCE_DETAIL_PRESETS.high, maxHouses: 30, fieldCount: 12 });
    expect(scenery.group.children.length).toBeLessThanOrEqual(2);
    expect(scenery.triangles).toBeLessThan(2000);
    for (const child of scenery.group.children) {
      const mesh = child as THREE.Mesh;
      expect((mesh.material as THREE.MeshStandardMaterial).fog).toBe(true);
      expect((mesh.material as THREE.MeshStandardMaterial).color.getHex()).toBe(0xffffff);
      expect(mesh.castShadow).toBe(false);
    }
    scenery.dispose();
  });

  it('refines hill normals and albedo without changing the real DEM silhouette or baked AO ratios', () => {
    const g = new THREE.PlaneGeometry(40, 40, 2, 2).rotateX(-Math.PI / 2);
    const colors = new Float32Array(g.getAttribute('position').count * 3).fill(0.5);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const before = (g.getAttribute('position').array as Float32Array).slice();
    refineDistantHills(g, (x, z) => x * 0.1 + z * 0.2, 0.08);
    expect(g.getAttribute('position').array).toEqual(before);
    const normal = new THREE.Vector3().fromBufferAttribute(g.getAttribute('normal'), 0);
    expect(normal.x).toBeCloseTo(-0.1 / Math.sqrt(1.05));
    expect(normal.z).toBeCloseTo(-0.2 / Math.sqrt(1.05));
    for (const value of g.getAttribute('color').array) expect(value).toBeGreaterThanOrEqual(0.46);
    g.dispose();
  });
});
