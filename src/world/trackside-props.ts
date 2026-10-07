import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { box, lathe } from '@/props/core/shapes';
import { buildTvCameraTower } from '@/props/builders/poles';
import { buildTyreStack } from '@/props/builders/trackside';
import type { DetailPlacement } from '@/world/trackside-layout';
import { createDetailMotionMaterial } from '@/world/detail-motion';

/** 0.7m traffic cone with a weighted base and two reflective white bands. */
export function buildDetailCone(): THREE.BufferGeometry {
  const mesher = new Mesher();
  mesher.add(box(0.48, 0.055, 0.48, 0, 0.0275, 0), TRACKSIDE.tyre);
  const bands: Array<[number, number, number, number, number]> = [
    [0.18, 0.055, 0.13, 0.25, TRACKSIDE.marshalOrange], [0.13, 0.25, 0.1, 0.36, BUILDING.white],
    [0.1, 0.36, 0.07, 0.47, TRACKSIDE.marshalOrange], [0.07, 0.47, 0.042, 0.57, BUILDING.white],
    [0.042, 0.57, 0.018, 0.7, TRACKSIDE.marshalOrange],
  ];
  for (const [r0, y0, r1, y1, color] of bands) mesher.add(lathe([[r0, y0], [r1, y1]], 8, { capEnd: y1 === 0.7 }), color);
  return mesher.build();
}

function flagPole(): THREE.BufferGeometry {
  const mesher = new Mesher();
  mesher.add(lathe([[0.036, 0], [0.025, 3.15]], 6, { capStart: true, capEnd: true }), TRACKSIDE.fencePost);
  mesher.add(box(0.18, 0.045, 0.18, 0, 0.0225, 0), TRACKSIDE.concrete);
  return mesher.build();
}

/** A furled green marshal flag, with no race-state claim attached to it. */
function marshalFlag(): THREE.BufferGeometry {
  const positions: number[] = [], colors: number[] = [], motion: number[] = [];
  const color = new THREE.Color(BUILDING.colorbondGreen), columns = 5, rows = 2;
  const point = (u: number, v: number) => [u * 0.82, 2.45 + v * 0.48 - u * 0.09, Math.sin(u * Math.PI * 3) * 0.08 + v * 0.025];
  const vertex = (u: number, v: number) => {
    positions.push(...point(u, v)); colors.push(color.r, color.g, color.b); motion.push(u * u, 0.7, 1.6);
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    const a = x / columns, b = (x + 1) / columns, c = y / rows, d = (y + 1) / rows;
    vertex(a, c); vertex(b, c); vertex(b, d); vertex(a, c); vertex(b, d); vertex(a, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('detailMotion', new THREE.Float32BufferAttribute(motion, 3)); geometry.computeVertexNormals();
  return geometry;
}

/** Batches each variant into one draw. Inputs have already passed barrier/mask checks. */
export function buildTracksideDetails(placements: readonly DetailPlacement[], flagMotion = 0) {
  const group = new THREE.Group(); group.name = 'trackside-detail';
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const motion = createDetailMotionMaterial(flagMotion, 1.15);
  const geometries: THREE.BufferGeometry[] = [], meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), scale = new THREE.Vector3(1, 1, 1);
  const batch = (name: string, places: readonly DetailPlacement[], geometry: THREE.BufferGeometry, mat = material) => {
    if (!places.length) { geometry.dispose(); return; }
    const mesh = new THREE.InstancedMesh(geometry, mat, places.length); mesh.name = name;
    places.forEach((p, k) => mesh.setMatrixAt(k, matrix.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), scale)));
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); mesh.boundingSphere!.radius += 0.08;
    mesh.receiveShadow = true; mesh.castShadow = name !== 'marshal-flags';
    group.add(mesh); geometries.push(geometry); meshes.push(mesh);
  };
  const flags = placements.filter(p => p.kind === 'flag');
  batch('marshal-flag-poles', flags, flagPole()); batch('marshal-flags', flags, marshalFlag(), motion.material);
  batch('service-cones', placements.filter(p => p.kind === 'cone'), buildDetailCone());
  batch('tv-camera-scaffolds', placements.filter(p => p.kind === 'tower'), buildTvCameraTower(0).geometry);
  for (const variant of [2, 3]) batch(`spare-tyre-stacks-${variant}`, placements.filter(p => p.kind === 'tyre' && p.variant === variant), buildTyreStack(variant).geometry);
  let disposed = false;
  return {
    group, update: motion.update, setFlagMotion: motion.setAmplitude,
    dispose: () => {
      if (disposed) return; disposed = true;
      meshes.forEach(mesh => mesh.dispose()); geometries.forEach(geometry => geometry.dispose()); material.dispose(); motion.material.dispose();
    },
  };
}
