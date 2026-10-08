// Gloved hands gripping the steering wheel at 9 and 3 o'clock, built in the
// wheel frame (x across, y up, -z towards the driver) so they turn with it.
// Each hand is a lofted fist around the grip with knuckle ridge, thumb over
// the top of the grip and a cuff running back towards the driver.
import * as THREE from 'three';
import { loft, merge, ringSection, tint } from '@/car/models/geo-utils';

export interface GloveColours { back: number; palm: number; cuff: number }

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

/** Grip centre on each side of the wheel (matches the rim/grips in interior-controls). */
const GRIP_X = 0.14;

function tube(points: THREE.Vector3[], radii: number[], n: number): THREE.BufferGeometry {
  const sections = points.map((p, i) => {
    const dir = (i < points.length - 1 ? points[i + 1].clone().sub(p) : p.clone().sub(points[i - 1])).normalize();
    const u = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? X : Y).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u).normalize();
    return ringSection(p, u, v, radii[i], radii[i], n, 2);
  });
  return loft(sections, true, true);
}

/** One fist around the grip on side s (+1 = the wheel's +x side). */
function hand(s: number, c: GloveColours, gripX: number): THREE.BufferGeometry {
  const gx = s * gripX;
  // Fist: stacked boxy rings along the grip (y), slightly fuller at the knuckles.
  const rows = [-0.05, -0.03, -0.005, 0.02, 0.04, 0.052];
  const width = [0.6, 0.92, 1, 1, 0.9, 0.55];
  const fist = loft(rows.map((y, i) => ringSection(new THREE.Vector3(gx + s * 0.006, y, -0.004), X, Z, 0.034 * width[i], 0.033 * width[i], 12, 2.6)), true, true);
  // Back of the hand faces the driver; the palm side (towards the dash) is darker.
  const pos = fist.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const back = new THREE.Color(c.back), palm = new THREE.Color(c.palm);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.smoothstep(-pos.getZ(i), -0.01, 0.012);
    const k = new THREE.Color().lerpColors(palm, back, t);
    col.set([k.r, k.g, k.b], i * 3);
  }
  fist.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // Knuckle ridge across the back of the fingers.
  const knuckles = tint(tube([0, 1, 2, 3].map((k) => new THREE.Vector3(gx - s * 0.012, -0.03 + k * 0.022, -0.034)), [0.009, 0.01, 0.01, 0.009], 6), c.back);
  // Thumb wraps over the inner side of the grip, pointing up the wheel.
  const thumb = tint(tube([
    new THREE.Vector3(gx - s * 0.03, 0.0, -0.022),
    new THREE.Vector3(gx - s * 0.036, 0.025, -0.012),
    new THREE.Vector3(gx - s * 0.028, 0.045, 0.004),
  ], [0.012, 0.011, 0.009], 7), c.back);
  // Wrist and a short gauntlet cuff back towards the driver.
  const wrist = tint(tube([
    new THREE.Vector3(gx + s * 0.02, -0.015, -0.03),
    new THREE.Vector3(gx + s * 0.032, -0.025, -0.07),
  ], [0.027, 0.03], 10), c.back);
  const cuff = tint(tube([
    new THREE.Vector3(gx + s * 0.032, -0.025, -0.07),
    new THREE.Vector3(gx + s * 0.04, -0.032, -0.1),
  ], [0.032, 0.033], 10), c.cuff);
  return merge([fist, knuckles, thumb, wrist, cuff]);
}

/** Both gloved hands (wheel frame); `gripX` is the grip's distance from the wheel centre. */
export function gloveHands(c: GloveColours, gripX = GRIP_X): THREE.BufferGeometry {
  return merge([hand(1, c, gripX), hand(-1, c, gripX)]);
}
