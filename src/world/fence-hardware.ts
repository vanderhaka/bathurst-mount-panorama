import * as THREE from 'three';
import { TRACKSIDE } from '@/art/palette';
import { TYRE_WALL_DEPTH } from '@/track/apply-layout';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';

export interface FenceHardwareOptions { enabled: boolean; caps: boolean; cableRows: number; stayEvery: number; maxPosts: number }
export const FENCE_HARDWARE_PRESETS = {
  low: { enabled: false, caps: false, cableRows: 0, stayEvery: 0, maxPosts: 0 },
  medium: { enabled: true, caps: true, cableRows: 0, stayEvery: 0, maxPosts: 4000 },
  high: { enabled: true, caps: true, cableRows: 2, stayEvery: 6, maxPosts: 4000 },
} as const;
interface Segment { a: THREE.Vector3; b: THREE.Vector3 }
interface FenceCap extends THREE.Vector3 { s: number; sample: number; side: number }
interface HardwareLayout { caps: FenceCap[]; cables: Segment[]; stays: Segment[] }
const WALL_HEIGHT = 1.05, FENCE_HEIGHT = 2.6, POST_SPACING = 4;

/** Matches barriers.ts posts, never joining gaps or large OSM wall-offset jumps. */
export function fenceHardwareLayout(track: Track, options: FenceHardwareOptions): HardwareLayout {
  const layout: HardwareLayout = { caps: [], cables: [], stays: [] };
  if (!options.enabled) return layout;
  const max = Math.min(4000, Math.max(0, Math.floor(options.maxPosts)));
  const rows = Math.min(3, Math.max(0, Math.floor(options.cableRows)));
  let total = 0;
  const out: [number, number, number] = [0, 0, 0];
  for (const sign of [1, -1]) {
    const side = sign > 0 ? track.left : track.right;
    let previous: { s: number; p: THREE.Vector3 } | null = null;
    for (let s = 0; s < track.length && total < max; s += POST_SPACING) {
      const i = Math.floor(track.wrapS(s) / track.spacing);
      if (!side.fence[i]) { previous = null; continue; }
      const offset = side.wall[i] + (side.barrier[i] === 'tyres' ? TYRE_WALL_DEPTH : 0) + 0.28;
      pointAt(track, s, sign * offset, out);
      const p = new THREE.Vector3(out[0], out[1] + WALL_HEIGHT + FENCE_HEIGHT, out[2]);
      if (options.caps) layout.caps.push(Object.assign(p.clone(), { s, sample: i, side: sign }));
      if (previous && s - previous.s <= POST_SPACING + 0.01 && previous.p.distanceTo(p) < 5.5) {
        for (let row = 0; row < rows; row++) {
          const drop = row === 0 ? 0.05 : row === 1 ? FENCE_HEIGHT * 0.55 : FENCE_HEIGHT - 0.12;
          layout.cables.push({ a: previous.p.clone().add(new THREE.Vector3(0, -drop, 0)), b: p.clone().add(new THREE.Vector3(0, -drop, 0)) });
        }
      }
      if (options.stayEvery > 0 && Math.floor(s / POST_SPACING) % Math.max(1, Math.floor(options.stayEvery)) === 0) {
        pointAt(track, s, sign * (offset + 1.05), out);
        layout.stays.push({ a: p.clone().add(new THREE.Vector3(0, -0.12, 0)), b: new THREE.Vector3(out[0], out[1] + WALL_HEIGHT + 0.12, out[2]) });
      }
      previous = { s, p }; total++;
    }
  }
  return layout;
}

/** Three shared small geometries, regardless of the number of supports. */
export function buildFenceHardware(track: Track, options: FenceHardwareOptions) {
  const group = new THREE.Group(); group.name = 'fence-hardware';
  const layout = fenceHardwareLayout(track, options);
  const material = new THREE.MeshStandardMaterial({ color: TRACKSIDE.fencePost, roughness: 0.58, metalness: 0.6 });
  const geometries: THREE.BufferGeometry[] = [], meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), midpoint = new THREE.Vector3(), direction = new THREE.Vector3();
  if (layout.caps.length) {
    const geometry = new THREE.ConeGeometry(0.06, 0.045, 6).translate(0, 0.018, 0);
    const mesh = new THREE.InstancedMesh(geometry, material, layout.caps.length);
    mesh.name = 'fence-post-caps';
    layout.caps.forEach((p, i) => mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)));
    group.add(mesh); geometries.push(geometry); meshes.push(mesh);
  }
  for (const [name, segments, radius] of [['fence-tension-cables', layout.cables, 0.007], ['fence-back-stays', layout.stays, 0.014]] as const) {
    if (!segments.length) continue;
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 4, 1, true);
    const mesh = new THREE.InstancedMesh(geometry, material, segments.length); mesh.name = name;
    segments.forEach(({ a, b }, i) => {
      direction.subVectors(b, a); midpoint.addVectors(a, b).multiplyScalar(0.5);
      quaternion.setFromUnitVectors(up, direction.clone().normalize());
      scale.set(radius, direction.length(), radius);
      mesh.setMatrixAt(i, matrix.compose(midpoint, quaternion, scale));
    });
    group.add(mesh); geometries.push(geometry); meshes.push(mesh);
  }
  for (const mesh of meshes) {
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.receiveShadow = true; mesh.castShadow = false;
  }
  let disposed = false;
  return { group, dispose: () => {
    if (disposed) return; disposed = true;
    meshes.forEach(mesh => mesh.dispose()); geometries.forEach(geometry => geometry.dispose()); material.dispose();
  } };
}
