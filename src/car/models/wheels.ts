// The four wheels as instanced meshes (one draw call per part for all four).
// Wheels are children of the model root, not of the sprung body.
import * as THREE from 'three';
import type { CarDimensions } from '@/car/car-specs';
import type { WheelIndex } from '@/types/car-model';
import type { CarLook, CarMaterialSet, SegmentLook } from '@/car/models/look';
import { merge, tint } from '@/car/models/geo-utils';
import { GEN3_WHEEL, caliperGeometry, discGeometry, nutGeometry, ratioTint, rimGeometry, tyreGeometry } from '@/car/models/wheel-geometry';
import { classicRimGeometry } from '@/car/models/wheel-classic';
import type { WheelStyle } from '@/car/models/profile-types';

export interface WheelSet {
  group: THREE.Group;
  meshes: THREE.InstancedMesh[];
  /** Static wheel centre positions (model frame). */
  centres: THREE.Vector3[];
  set(index: WheelIndex, spin: number, steer: number, suspension: number): void;
}

/** Spinning parts of the right-hand wheels: turned about y so the outer face points to -x. */
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);
/** Fixed parts (caliper) of the right-hand wheels: turned about z, so the caliper stays at the rear of the disc. */
const FLIP_FIXED = new THREE.Matrix4().makeRotationZ(Math.PI);
/** Polished rim lip colour (sRGB); the rest of the rim takes look.rim.colour. */
const RIM_LIP = 0xc9ccd1;

/** Turns absolute vertex colours into ratios against a material colour that multiplies them. */
function colourRatios(g: THREE.BufferGeometry, base: number): THREE.BufferGeometry {
  const b = new THREE.Color(base);
  const k = [Math.max(0.01, b.r), Math.max(0.01, b.g), Math.max(0.01, b.b)];
  const col = g.getAttribute('color') as THREE.BufferAttribute;
  for (let i = 0; i < col.count; i++) col.setXYZ(i, col.getX(i) / k[0], col.getY(i) / k[1], col.getZ(i) / k[2]);
  return g;
}

export function createWheels(dims: CarDimensions, mats: CarMaterialSet, seg: SegmentLook, high: boolean, look: CarLook, style: WheelStyle = GEN3_WHEEL): WheelSet {
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
  const classic = style.kind === 'classic';
  const tyre = tyreGeometry(R, dims.tyreWidth, seg.tyreRadial, high, style.rimRadius);
  // High detail: the centre-lock nut rides in the rim mesh (one draw call less). The
  // rim material multiplies vertex colours, so the nut's colours are nut / rim.
  const rim = classic
    ? (high ? colourRatios(classicRimGeometry(style, seg.tyreRadial, seg.spokes, high), look.rim.colour) : classicRimGeometry(style, seg.tyreRadial, seg.spokes, high))
    : high ? merge([rimGeometry(seg.tyreRadial, seg.spokes, high, style, { colour: RIM_LIP, base: look.rim.colour }), ratioTint(nutGeometry(), look.nut.colour, look.rim.colour)]) : rimGeometry(seg.tyreRadial, seg.spokes, high, style);
  // Low detail: tyre and rim share one draw call (colours baked; rebuild to retune).
  const meshes = high
    ? [make(tyre, mats.tyre, 'tyre', true), make(rim, mats.rim, 'rim', true)]
    : [make(merge([tint(tyre, look.tyre.colour), classic ? rim : tint(rim, look.rim.colour)]), mats.trim, 'wheel', true)];
  if (high) {
    meshes.push(make(discGeometry(seg.discRadial, style.discRadius), mats.disc ?? mats.rim, 'disc', true));
    meshes.push(make(caliperGeometry(style.discRadius, style.rimRadius), mats.caliper ?? mats.rim, 'caliper', false));
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
    if (right) fixed.multiply(FLIP_FIXED);
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
