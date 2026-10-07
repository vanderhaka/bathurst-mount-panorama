// Ray queries against a slice of the body grid (rest shape), used to seat
// lights, mirrors and aero parts on the lofted surface.
import * as THREE from 'three';
import type { BodyGrid } from '@/car/models/body-grid';

export interface ProbeHit { point: THREE.Vector3; normal: THREE.Vector3 }

export interface BodyProbe {
  cast(origin: THREE.Vector3, dir: THREE.Vector3): ProbeHit | null;
  dispose(): void;
}

/** Builds a probe over grid rows [r0, r1] (all columns), plus any extra geometry. */
export function makeProbe(grid: BodyGrid, r0: number, r1: number, extra: THREE.BufferGeometry[] = []): BodyProbe {
  const from = Math.max(0, r0);
  const to = Math.min(grid.rows - 1, r1);
  const pos: number[] = [];
  const cols = grid.cols;
  const p = (r: number, c: number) => {
    const i = (r * cols + c) * 3;
    return [grid.rest[i], grid.rest[i + 1], grid.rest[i + 2]];
  };
  for (let r = from; r < to; r++) {
    for (let c = 0; c < cols - 1; c++) {
      pos.push(...p(r, c), ...p(r, c + 1), ...p(r + 1, c));
      pos.push(...p(r, c + 1), ...p(r + 1, c + 1), ...p(r + 1, c));
    }
  }
  for (const e of extra) {
    const flat = e.index ? e.toNonIndexed() : e;
    pos.push(...(flat.getAttribute('position').array as Float32Array));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  return {
    cast(origin, dir) {
      ray.set(origin, dir.clone().normalize());
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit || !hit.face) return null;
      const n = hit.face.normal.clone();
      if (n.dot(dir) > 0) n.negate();
      return { point: hit.point.clone(), normal: n };
    },
    dispose() {
      g.dispose();
      (mesh.material as THREE.Material).dispose();
    },
  };
}
