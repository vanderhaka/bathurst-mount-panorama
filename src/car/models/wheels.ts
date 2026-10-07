// The four wheels as instanced meshes (one draw call per part for all four).
// Wheels are children of the model root, not of the sprung body.
import * as THREE from 'three';
import type { CarDimensions } from '@/car/car-specs';
import type { WheelIndex } from '@/types/car-model';
import type { CarLook, CarMaterialSet, SegmentLook } from '@/car/models/look';
import { merge, tint } from '@/car/models/geo-utils';
import { caliperGeometry, discGeometry, nutGeometry, rimGeometry, tyreGeometry } from '@/car/models/wheel-geometry';

export interface WheelSet {
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
  /** Static wheel centre positions (model frame). */
  centres: THREE.Vector3[];
  set(index: WheelIndex, spin: number, steer: number, suspension: number): void;
}

const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

/** Vertex colours of `colour` relative to a material colour `base` (linear, per channel). */
function ratioTint(g: THREE.BufferGeometry, colour: number, base: number): THREE.BufferGeometry {
  const c = new THREE.Color(colour);
  const b = new THREE.Color(base);
  const k = [c.r / Math.max(0.01, b.r), c.g / Math.max(0.01, b.g), c.b / Math.max(0.01, b.b)];
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set(k, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export function createWheels(dims: CarDimensions, mats: CarMaterialSet, seg: SegmentLook, high: boolean, look: CarLook): WheelSet {
  const group = new THREE.Group();
  group.name = 'wheels';
  const R = dims.wheelRadius;
  const centres = [
    new THREE.Vector3(dims.trackFront / 2, R, dims.wheelbase / 2),
    new THREE.Vector3(-dims.trackFront / 2, R, dims.wheelbase / 2),
    new THREE.Vector3(dims.trackRear / 2, R, -dims.wheelbase / 2),
    new THREE.Vector3(-dims.trackRear / 2, R, -dims.wheelbase / 2),
  ];
  const make = (g: THREE.BufferGeometry, m: THREE.Material, name: string, spins: boolean) => {
    const mesh = new THREE.InstancedMesh(g, m, 4);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.spins = spins;
    group.add(mesh);
    return mesh;
  };
  const tyre = tyreGeometry(R, dims.tyreWidth, seg.tyreRadial, high);
  // High detail: the centre-lock nut rides in the rim mesh (one draw call less). The
  // rim material multiplies vertex colours, so the nut's colours are nut / rim.
  const rim = high ? merge([tint(rimGeometry(seg.tyreRadial, seg.spokes, high), 0xffffff), ratioTint(nutGeometry(), look.nut.colour, look.rim.colour)]) : rimGeometry(seg.tyreRadial, seg.spokes, high);
  // Low detail: tyre and rim share one draw call (colours baked; rebuild to retune).
  const meshes = high
    ? [make(tyre, mats.tyre, 'tyre', true), make(rim, mats.rim, 'rim', true)]
    : [make(merge([tint(tyre, look.tyre.colour), tint(rim, look.rim.colour)]), mats.trim, 'wheel', true)];
  if (high) {
    meshes.push(make(discGeometry(seg.discRadial, 0.183), mats.disc ?? mats.rim, 'disc', true));
    meshes.push(make(caliperGeometry(0.183), mats.caliper ?? mats.rim, 'caliper', false));
  }
  const spinM = new THREE.Matrix4();
  const steerM = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const fixed = new THREE.Matrix4();
  const set = (index: WheelIndex, spin: number, steer: number, suspension: number) => {
    const c = centres[index];
    const right = index === 1 || index === 3;
    steerM.makeRotationY(steer).setPosition(c.x, c.y + suspension, c.z);
    fixed.copy(steerM);
    if (right) fixed.multiply(FLIP);
    spinM.makeRotationX(spin);
    m.copy(steerM).multiply(spinM);
    if (right) m.multiply(FLIP);
    for (const mesh of meshes) {
      mesh.setMatrixAt(index, mesh.userData.spins ? m : fixed);
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  for (let i = 0; i < 4; i++) set(i as WheelIndex, 0, 0, 0);
  for (const mesh of meshes) {
    mesh.computeBoundingSphere();
    if (mesh.boundingSphere) mesh.boundingSphere.radius += 0.3;
  }
  return { group, meshes, centres, set };
}
