import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createTracksideLayer } from '@/world/scenery/trackside-layer';
import { Track } from '@/track/track-model';
import { SpatialMask } from '@/world/scenery/geo';
import type { Terrain } from '@/world/terrain';

describe('trackside layer ownership and budgets', () => {
  it('caps a stand and its new crowd together at 15000 triangles and disposes once', () => {
    const ground = { heightAt: () => 50, clearance: () => 20, box: { x0: -1000, x1: 1000, z0: -1000, z1: 1000 } } as unknown as Terrain;
    const detail = createTracksideLayer(new Track(), ground, new SpatialMask(), 'high');
    const stand = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); stand.add(base);
    detail.addCrowd(stand, { length: 180, rows: 30, roof: false, seed: 12 });
    let triangles = 0, disposal = 0;
    stand.traverse(o => { if (o instanceof THREE.Mesh) triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3; });
    expect(triangles).toBeLessThanOrEqual(15000);
    const crowd = stand.getObjectByName('grandstand-crowd-detail') as THREE.Mesh;
    expect(crowd).toBeDefined();
    const material = Array.isArray(crowd.material) ? crowd.material[0] : crowd.material;
    material.addEventListener('dispose', () => disposal++);
    detail.update(1); detail.dispose(); detail.dispose(); expect(disposal).toBe(1);
  });
  it('leaves Low stands on their existing crowd and keeps expensive motion off Medium', () => {
    const ground = { heightAt: () => 0, clearance: () => 20, box: { x0: -1000, x1: 1000, z0: -1000, z1: 1000 } } as unknown as Terrain;
    const layer = createTracksideLayer(new Track(), ground, new SpatialMask(), 'low');
    expect(layer.crowdEnabled).toBe(false); expect(layer.mappedTowers).toBe(false); layer.dispose();
  });
});
