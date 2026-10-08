// Soft dark blob under a car: one transparent plane, one draw call, on every quality tier.
import * as THREE from 'three';

const SIZE = 64;
/** Height above the road (m): just under the body, clear of the road's own offset. */
const LIFT = 0.018;

let shared: THREE.DataTexture | null = null;

/** Rounded-box alpha falloff (generated, no canvas needed). */
function blobTexture(): THREE.DataTexture {
  if (shared) return shared;
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE * 2 - 1;
      const v = (y + 0.5) / SIZE * 2 - 1;
      // Superellipse distance: boxy like a car footprint, soft towards the edge.
      const d = Math.pow(Math.pow(Math.abs(u), 3) + Math.pow(Math.abs(v), 3), 1 / 3);
      const a = Math.max(0, 1 - d);
      const i = (y * SIZE + x) * 4;
      data[i + 3] = Math.round(255 * a * a * (3 - 2 * a));
    }
  }
  shared = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  shared.magFilter = THREE.LinearFilter;
  shared.minFilter = THREE.LinearFilter;
  shared.needsUpdate = true;
  return shared;
}

export interface ContactShadow { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial }

/** Plane of `length` (z) by `width` (x) metres centred at (0, z). Add it to the unsprung car root. */
export function createContactShadow(length: number, width: number, z: number, opacity: number): ContactShadow {
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000, map: blobTexture(), transparent: true, opacity, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  });
  material.name = 'car-contact-shadow';
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), material);
  mesh.name = 'contact-shadow';
  mesh.position.set(0, LIFT, z);
  mesh.renderOrder = 1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.userData.contactShadow = true;
  return { mesh, material };
}
