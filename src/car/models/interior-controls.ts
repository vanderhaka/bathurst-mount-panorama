// Driver controls: the flat-bottomed race steering wheel (built in its own
// frame: x across, y up, -z towards the driver) and the centre switch panel.
import * as THREE from 'three';
import { extrude, merge, tint } from '@/car/models/geo-utils';
import { buildHands } from '@/car/models/interior-driver';
import { gloveHands, type GloveColours } from '@/car/models/interior-hands';

const CARBON = 0x18191b;
const SUEDE = 0x2c2d31;

/** Closed rim path: rounded top corners, straight sides, flat bottom. */
function rimPath(): THREE.Vector3[] {
  const w = 0.14, top = 0.085, bottom = -0.07, rt = 0.05, rb = 0.022;
  const pts: THREE.Vector3[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n: number) => {
    for (let k = 0; k <= n; k++) {
      const a = a0 + ((a1 - a0) * k) / n;
      pts.push(new THREE.Vector3(cx + r * Math.cos(a), cy + r * Math.sin(a), 0));
    }
  };
  arc(w - rt, top - rt, rt, 0, Math.PI / 2, 4);
  arc(-w + rt, top - rt, rt, Math.PI / 2, Math.PI, 4);
  arc(-w + rb, bottom + rb, rb, Math.PI, 1.5 * Math.PI, 2);
  arc(w - rb, bottom + rb, rb, 1.5 * Math.PI, 2 * Math.PI, 2);
  return pts;
}

function button(x: number, y: number, r: number, colour: number, segs: number): THREE.BufferGeometry[] {
  const bezel = new THREE.CylinderGeometry(r * 1.35, r * 1.35, 0.004, segs).rotateX(Math.PI / 2).translate(x, y, -0.001);
  const cap = new THREE.CylinderGeometry(r, r * 1.05, 0.007, segs).rotateX(Math.PI / 2).translate(x, y, -0.006);
  return [tint(bezel, 0x0c0c0d), tint(cap, colour)];
}

/**
 * Race steering wheel with grips, buttons and rotaries, with the driver's
 * gloved hands at 9 and 3 o'clock (detailed: full gloves; simple: blobs).
 */
export function steeringWheel(detailed: boolean, glove: number, hands?: GloveColours): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3(rimPath(), true, 'centripetal');
  const rim = tint(new THREE.TubeGeometry(path, detailed ? 56 : 20, 0.014, detailed ? 8 : 4, true), SUEDE);
  if (!detailed) return merge([rim, buildHands(glove)]);
  const grips = [1, -1].map((s) =>
    tint(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(s * 0.14, -0.035, 0), new THREE.Vector3(s * 0.14, 0.04, 0)), 3, 0.02, 10), 0x1e1f22));
  const plate = tint(extrude([[-0.115, -0.06], [0.115, -0.06], [0.125, 0.035], [0.06, 0.05], [-0.06, 0.05], [-0.125, 0.035]], 0.016, (a, b, d) => [a, b, 0.002 + d]), CARBON);
  // Thin 12 o'clock stripe wrapped round the top of the rim.
  const marker = tint(new THREE.CylinderGeometry(0.0162, 0.0162, 0.01, 12).rotateZ(Math.PI / 2).translate(0, 0.085, 0), 0xe0b52a);
  const caps = [0xc8382c, 0xd9a521, 0x2f6fc2, 0x2e9e55, 0xd8d8d2, 0xd56a1f];
  const buttons = [[-0.085, 0.022], [-0.085, -0.012], [-0.085, -0.044], [0.085, 0.022], [0.085, -0.012], [0.085, -0.044]]
    .flatMap(([x, y], i) => button(x, y, 0.0075, caps[i], 12));
  const rotaries = [-0.035, 0.035].flatMap((x) => [
    tint(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 14).rotateX(Math.PI / 2).translate(x, -0.035, -0.007), 0x8a8d92),
    tint(new THREE.BoxGeometry(0.003, 0.012, 0.003).translate(x, -0.03, -0.014), 0xf2f2f2),
  ]);
  const centre = tint(new THREE.BoxGeometry(0.07, 0.03, 0.004).translate(0, 0.01, -0.001), 0x0a0c0f);
  return merge([rim, ...grips, plate, marker, centre, ...buttons, ...rotaries, hands ? gloveHands(hands) : buildHands(glove)]);
}

/**
 * Centre switch panel: a flat carbon plate with rows of rocker switches with
 * coloured caps and a red master switch. `place` maps panel (u across, v up the
 * plate, w out of the plate) to car coordinates.
 */
export function switchPanel(place: THREE.Matrix4): THREE.BufferGeometry {
  const W = 0.2, H = 0.15;
  const parts: THREE.BufferGeometry[] = [tint(new THREE.BoxGeometry(W, H, 0.01).translate(0, 0, -0.005), CARBON)];
  const caps = [0xc8382c, 0xd9a521, 0x2f6fc2, 0x2e9e55, 0xd8d8d2, 0xd9a521, 0x2f6fc2, 0xc8382c, 0x2e9e55, 0xd8d8d2, 0xd56a1f, 0x2f6fc2];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const u = -0.06 + col * 0.04;
      const v = 0.045 - row * 0.04;
      const on = (row + col) % 3 === 0 ? 1 : -1;
      parts.push(tint(new THREE.BoxGeometry(0.024, 0.032, 0.004).translate(u, v, 0.002), 0x0a0a0b));
      const rocker = new THREE.BoxGeometry(0.016, 0.026, 0.008).rotateX(on * 0.18).translate(u, v, 0.007);
      parts.push(tint(rocker, 0x2a2b2e));
      parts.push(tint(new THREE.BoxGeometry(0.014, 0.008, 0.004).rotateX(on * 0.18).translate(u, v + 0.008, 0.0115 + on * 0.0015), caps[row * 4 + col]));
      parts.push(tint(new THREE.BoxGeometry(0.018, 0.003, 0.001).translate(u, v - 0.02, 0.0005), 0xbfc3c8));
    }
  }
  parts.push(tint(new THREE.CylinderGeometry(0.014, 0.016, 0.008, 16).rotateX(Math.PI / 2).translate(0.075, 0.03, 0.004), 0x111214));
  parts.push(tint(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16).rotateX(Math.PI / 2).translate(0.075, 0.03, 0.01), 0xc0201a));
  const g = merge(parts);
  g.applyMatrix4(place);
  return g;
}
