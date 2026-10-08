import * as THREE from 'three';
import type { Vehicle } from '@/physics/vehicle';
import { createTrackPoint, heightAt, projectToTrack, surfaceAt } from '@/track/track-query';

export interface FloorContact { clearance: number; x: number; y: number; z: number }
export interface FloorProbe { mesh: THREE.Mesh; index: number }
const attitude = new THREE.Euler(0, 0, 0, 'YXZ'), point = new THREE.Vector3(), tp = createTrackPoint();
const cache = new WeakMap<THREE.Object3D, FloorProbe[]>();

/** At most 21 low surface vertices per named mesh; retain indices so damage/hinges stay live. */
export function floorProbes(root: THREE.Object3D): ReadonlyArray<FloorProbe> {
  const found = cache.get(root); if (found) return found;
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert(), p = new THREE.Vector3(), probes: FloorProbe[] = [];
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !['underside', 'splitter'].includes(o.name)) return;
    const positions = o.geometry.getAttribute('position'), buckets = new Map<number, { y: number; index: number }>();
    const relative = new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld);
    for (let i = 0; i < positions.count; i++) {
      p.fromBufferAttribute(positions, i).applyMatrix4(relative);
      if (p.y > 0.09) continue;
      const x = p.x < -0.4 ? 0 : p.x > 0.4 ? 2 : 1;
      const z = Math.max(0, Math.min(6, Math.floor((p.z + 2.6) / 0.75))), key = z * 3 + x;
      if (p.y < (buckets.get(key)?.y ?? Infinity)) buckets.set(key, { y: p.y, index: i });
    }
    for (const b of buckets.values()) probes.push({ mesh: o, index: b.index });
  });
  cache.set(root, probes); return probes;
}

/** Visible model surfaces when supplied; otherwise five conservative specification-based points. */
export function floorContact(v: Vehicle, out: FloorContact = { clearance: Infinity, x: 0, y: 0, z: 0 }, root?: THREE.Object3D): FloorContact {
  const d = v.spec.dimensions, mid = d.wheelbase * (0.5 - v.spec.frontWeight);
  attitude.set(-v.pitch, v.heading, v.roll, 'YXZ');
  out.clearance = Infinity;
  const sample = () => {
    projectToTrack(v.track, point.x, point.z, v.tp.index, tp);
    if (surfaceAt(v.track, tp.index, tp.t, tp.d, v.kerbs.left, v.kerbs.right) !== 'road') return;
    const ground = heightAt(v.track, tp.index, tp.t, tp.d), clearance = point.y - ground;
    if (clearance < out.clearance) { out.clearance = clearance; out.x = point.x; out.y = ground + 0.006; out.z = point.z; }
  };
  if (root) {
    root.updateMatrixWorld(true);
    for (const p of floorProbes(root)) { point.fromBufferAttribute(p.mesh.geometry.getAttribute('position'), p.index).applyMatrix4(p.mesh.matrixWorld); sample(); }
  } else {
    for (const [x, z] of [[0, 0], [-0.58, -0.85], [0.58, -0.85], [-0.58, 0.85], [0.58, 0.85]]) {
      point.set(x, d.rideHeight, z + mid).applyEuler(attitude);
      point.x += v.x; point.y += v.y - v.spec.cgHeight; point.z += v.z; sample();
    }
  }
  return out;
}
