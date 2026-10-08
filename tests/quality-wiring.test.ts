import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
const bake = vi.hoisted(() => vi.fn());
vi.mock('@/config/graphics', async (load) => {
  const actual = await load<typeof import('@/config/graphics')>();
  return { ...actual, QUALITY: { ...actual.QUALITY, low: { ...actual.QUALITY.low, shadowMap: 768, bakedAo: false } } };
});
vi.mock('@/art/ambient-occlusion', async (load) => ({
  ...await load<typeof import('@/art/ambient-occlusion')>(), bakeHeightFieldAo: bake,
}));
import { createShadowRig } from '@/world/shadows';
import { buildTerrain } from '@/world/terrain';
import { Track } from '@/track/track-model';

it('uses the tier shadow-map size rather than a duplicate policy', () => {
  const rig = createShadowRig(new THREE.Scene(), new THREE.PerspectiveCamera(), 'low');
  expect(rig.sun.shadow.mapSize.x).toBe(768);
  expect(rig.sun.shadow.mapSize.y).toBe(768);
  rig.dispose();
});

it('honours the baked-AO switch when building fine and coarse terrain', () => {
  const terrain = buildTerrain(new Track(), new THREE.MeshStandardMaterial(), 'low');
  expect(bake).toHaveBeenCalled();
  for (const call of bake.mock.calls) expect(call[4]).toBe(0);
  terrain.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
  terrain.dispose();
}, 30000); // builds the full Bathurst terrain: ~3.6 s on the 2-worker CI runner, too close to the 5 s default
