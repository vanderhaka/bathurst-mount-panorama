import * as THREE from 'three';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const counter = vi.hoisted(() => ({ projections: 0 }));
vi.mock('@/track/track-query', async (load) => {
  const actual = await load<typeof import('@/track/track-query')>();
  return { ...actual, projectToTrack: (...args: Parameters<typeof actual.projectToTrack>) => { counter.projections++; return actual.projectToTrack(...args); } };
});
import { Track } from '@/track/track-model';
import { createCorridorMask } from '@/world/corridor-mask';
import { buildTerrain, type Terrain } from '@/world/terrain';

const fineMeshes = (terrain: Terrain) => {
  const meshes: THREE.Mesh[] = [];
  terrain.group.traverse(o => { if (o instanceof THREE.Mesh && o.name.startsWith('terrain-fine')) meshes.push(o); });
  return meshes;
};

describe('terrain build', () => {
  const track = new Track();
  let terrain: Terrain;
  let projections = 0;
  beforeAll(() => {
    counter.projections = 0;
    terrain = buildTerrain(track, new THREE.MeshStandardMaterial(), 'low');
    projections = counter.projections;
  });

  it('projects onto the track only where the corridor can reach (a few times per fine vertex)', () => {
    const vertices = fineMeshes(terrain).reduce((n, m) => n + m.geometry.getAttribute('position').count, 0);
    // Each vertex once for its colour; carved vertices also for height and normal (6+ per vertex before).
    expect(projections).toBeLessThan(vertices * 3);
  });

  it('gives the vertices that neighbouring chunks share one height and one normal', () => {
    const seen = new Map<string, { y: number; n: THREE.Vector3 }>();
    let shared = 0;
    for (const mesh of fineMeshes(terrain)) {
      const p = mesh.geometry.getAttribute('position'), n = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i)},${p.getZ(i)}`, normal = new THREE.Vector3().fromBufferAttribute(n, i);
        const other = seen.get(key);
        if (!other) { seen.set(key, { y: p.getY(i), n: normal }); continue; }
        shared++;
        expect(p.getY(i), key).toBe(other.y);
        expect(normal.angleTo(other.n), key).toBeLessThan(1e-3);
      }
    }
    expect(shared).toBeGreaterThan(1000);
  });

  it('never skips ground that lies within reach of the centreline', () => {
    const box = { x0: -200, z0: -200, x1: 200, z1: 200 };
    const square = { n: 4, px: [-100, 100, 100, -100], pz: [-100, -100, 100, 100], wrap: (i: number) => ((i % 4) + 4) % 4 } as unknown as Track;
    const reach = 25, mask = createCorridorMask(square, box, reach, 16);
    const toSquare = (x: number, z: number) => {
      const ax = Math.abs(x), az = Math.abs(z);
      return ax <= 100 && az <= 100 ? 100 - Math.max(ax, az) : Math.hypot(Math.max(0, ax - 100), Math.max(0, az - 100));
    };
    let skipped = 0;
    for (let x = -199.5; x < 200; x += 1.5) for (let z = -199.5; z < 200; z += 1.5) {
      if (toSquare(x, z) <= reach) expect(mask(x, z), `${x},${z}`).toBe(true);
      if (!mask(x, z)) skipped++;
    }
    expect(skipped).toBeGreaterThan(20000);
    expect(mask(-500, 0)).toBe(true);
  });
});
