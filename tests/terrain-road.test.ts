import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';
import { buildTerrain } from '@/world/terrain';

// The terrain must never rise through the road, the verges or the walls.
describe('terrain stays below the circuit', () => {
  it('is below the road, the kerbs and the first 3 m of verge everywhere', () => {
    const track = new Track();
    const terrain = buildTerrain(track);
    let worst = -Infinity, at = '';
    for (let i = 0; i < track.n; i += 2) {
      for (const side of [1, -1] as const) {
        const arr = side > 0 ? track.left : track.right;
        for (let d = 0; d <= Math.min(arr.wall[i], arr.edge[i] + 3); d += 1) {
          const x = track.px[i] + track.lx[i] * side * d, z = track.pz[i] + track.lz[i] * side * d;
          const gap = terrain.heightAt(x, z) - heightAt(track, i, 0, side * d);
          if (gap > worst) { worst = gap; at = `s=${(i * track.spacing).toFixed(0)} d=${(side * d).toFixed(1)}`; }
        }
      }
    }
    expect(worst, `terrain above the road at ${at}`).toBeLessThan(0);
    // The far landscape mesh must stay under the road too (it once showed through on Conrod).
    const coarse = terrain.group.getObjectByName('terrain-coarse') as THREE.Mesh;
    const ray = new THREE.Raycaster();
    for (let i = 0; i < track.n; i += 16) {
      const y = heightAt(track, i, 0, 0);
      ray.set(new THREE.Vector3(track.px[i], y + 200, track.pz[i]), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(coarse)[0];
      if (hit) expect(hit.point.y, `coarse terrain at s=${(i * track.spacing).toFixed(0)}`).toBeLessThan(y - 1);
    }
  }, 60000);
});
