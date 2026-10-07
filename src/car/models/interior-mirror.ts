// Interior rear-view mirror: a 3:1 glass face at the top centre of the
// windscreen that shows either a live rear-view texture (unlit, mirrored
// left/right like a real mirror) or a dark grey-blue reflective glass, plus the
// 'mirrorEye' anchor for the game's rear-view camera.
import * as THREE from 'three';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, merge, tint } from '@/car/models/geo-utils';

/** Glass size (m): about 3:1, the aspect of the rear-view texture. */
const GLASS_W = 0.21;
const GLASS_H = 0.07;

export interface InteriorMirror {
  /** Frame geometry (merged into the cockpit mesh by the caller). */
  frame: THREE.BufferGeometry;
  glass: THREE.Mesh;
  /** Camera anchor at the mirror, oriented like a three.js camera looking backwards. */
  eye: THREE.Object3D;
  setTexture(tex: THREE.Texture | null): void;
  dispose(): void;
}

/** `zTail`: rear-most body z, used to suggest a near plane that skips the car itself. */
export function buildInteriorMirror(p: BodyProfile, cv: CurveSet, zTail: number): InteriorMirror {
  const z = p.z.roofFront + 0.1;
  const y = cv.topY(p.z.roofFront) - 0.08;
  const centre = new THREE.Vector3(0, y, z);
  // Frame: a shallow box behind the glass (the glass faces -Z, towards the driver).
  const fw = GLASS_W / 2 + 0.008;
  const fh = GLASS_H / 2 + 0.008;
  const frame = tint(extrude([[-fw, -fh], [fw, -fh], [fw, fh], [-fw, fh]], 0.016, (a, b, d) => [a, y + b, z + d], 0.003), 0x141517);
  const stem = tint(extrude([[-0.012, 0], [0.012, 0], [0.012, 0.09], [-0.012, 0.09]], 0.012, (a, b, d) => [a, y + fh - 0.01 + b, z + 0.004 + d]), 0x141517);

  const g = new THREE.PlaneGeometry(GLASS_W, GLASS_H);
  g.rotateY(Math.PI); // face the driver (-Z)
  // Mirror image: flip u so that the camera picture reads reversed, as in a real mirror.
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  // After rotateY(PI) the plane's +x runs to the driver's right; with the flip,
  // texture u=0 (the left of the rear camera image) appears on the driver's right.
  g.translate(centre.x, centre.y, centre.z - 0.0055); // just in front of the frame bevel (3 mm)
  // Plain mirror glass: a mid grey-blue metal reflects the sky as a dark grey-blue (a dark base colour would read black).
  const dark = new THREE.MeshStandardMaterial({ color: 0x7f878f, roughness: 0.05, metalness: 1, envMapIntensity: 1 });
  const live = new THREE.MeshBasicMaterial({ toneMapped: false });
  const glass = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(g, dark);
  glass.name = 'rear-view-mirror';

  const eye = new THREE.Object3D();
  eye.name = 'mirrorEye';
  // A three.js camera looks down its local -Z: identity rotation looks backwards along the car.
  eye.position.copy(centre).add(new THREE.Vector3(0, 0.02, -0.03));
  eye.rotation.set(0.03, 0, 0);
  // Near-plane distance that clips the car's own cabin and tail out of the rear view.
  eye.userData.clearNear = Math.max(0.05, eye.position.z - zTail + 0.1);

  return {
    frame: merge([frame, stem]),
    glass,
    eye,
    setTexture(tex) {
      const target = tex ? live : dark;
      if (tex && live.map !== tex) {
        live.map = tex;
        live.needsUpdate = true;
      }
      if (!tex) live.map = null;
      // While the ghost look is on, the real material is parked in userData.look.
      if (glass.userData.look) glass.userData.look.material = target;
      else glass.material = target;
    },
    dispose() {
      g.dispose();
      dark.dispose();
      live.dispose();
    },
  };
}
