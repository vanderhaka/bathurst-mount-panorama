import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createAdelaideTrack } from '@/track/adelaide';
import { buildStartMarkings } from '@/world/road';

it('renders the timing stripe and all 12 Adelaide grid slots across the closed-loop seam', () => {
  const track = createAdelaideTrack(), material = new THREE.MeshBasicMaterial();
  const markings = buildStartMarkings(track, material);
  const mesh = markings.children[0] as THREE.Mesh;
  const positions = mesh.geometry.getAttribute('position');
  expect(positions.count).toBe(13 * 4);
  for (let i = 0; i < positions.count; i++) expect(Number.isFinite(positions.getX(i) + positions.getY(i) + positions.getZ(i))).toBe(true);
  expect(track.gridLineS).toBeGreaterThan(track.startLineS + 7);
  mesh.geometry.dispose(); material.dispose();
});
