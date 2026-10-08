// Classic (1970s) cockpit pieces: a flat upright dash with a silver-grey face,
// a binnacle with two large square dials (the live canvas is mapped on them) and
// two small dials, a plate of toggle switches, and the floor gear lever.
import * as THREE from 'three';
import type { CurveSet } from '@/car/models/body-section';
import type { BodyProfile } from '@/car/models/profile-types';
import { extrude, merge, tint } from '@/car/models/geo-utils';
import { tube } from '@/car/models/interior-cage';
import type { Dash } from '@/car/models/interior-dash';

export interface ClassicCockpit {
  /** Static dash, tunnel and binnacle (always shown). */
  dash: Dash;
  /** Small dials and toggle plate (cockpit view). */
  detail: THREE.BufferGeometry;
  /** Two dial quads textured from the display canvas: tachometer in the left half, speedometer in the right. */
  dials: THREE.BufferGeometry;
  lever: THREE.BufferGeometry;
}

const BLACK = 0x1b1b1d;
const FACE = 0x8c8f93;
const HALF_W = 0.74;
const DIAL = 0.135;
const PITCH = 0.158;

function box(cx: number, cy: number, cz: number, w: number, h: number, d: number, colour: number): THREE.BufferGeometry {
  return tint(new THREE.BoxGeometry(w, h, d).translate(cx, cy, cz), colour);
}

/** Dial quads facing the driver (-z) at the binnacle plane `z`; UVs take the left / right half of the canvas. */
function dialQuads(tach: THREE.Vector2, speedo: THREE.Vector2, z: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  [{ c: tach, u0: 0 }, { c: speedo, u0: 0.5 }].forEach(({ c, u0 }, q) => {
    const { x, y } = c;
    const h = DIAL / 2;
    // The driver looks along +z, so world +x is to the viewer's left.
    pos.push(x + h, y - h, z, x - h, y - h, z, x - h, y + h, z, x + h, y + h, z);
    uv.push(u0, 0, u0 + 0.5, 0, u0 + 0.5, 1, u0, 1);
    idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: 8 }, () => [0, 0, -1]).flat(), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Rounded-square bezel plate behind a dial. */
function bezel(cx: number, cy: number, z: number): THREE.BufferGeometry {
  const h = DIAL / 2 + 0.008;
  const c = 0.024;
  const o: Array<[number, number]> = [[-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c], [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c]];
  return tint(extrude(o, 0.006, (a, b, d) => [cx + a, cy + b, z - d]), 0x0a0a0b);
}

/** Small round dial (fuel, temperature) with an orange needle. */
function smallDial(cx: number, cy: number, z: number, needle: number): THREE.BufferGeometry[] {
  const disc = (r: number, t: number, zz: number, colour: number) => tint(new THREE.CylinderGeometry(r, r, t, 14).rotateX(Math.PI / 2).translate(cx, cy, zz), colour);
  const n = box(0, 0.011, 0, 0.004, 0.024, 0.001, 0xff7a1a).rotateZ(needle).translate(cx, cy, z - 0.0078);
  return [disc(0.032, 0.006, z - 0.003, 0x9a9da2), disc(0.027, 0.002, z - 0.0065, 0x101113), n];
}

/** Plain plate with four toggle switches, low in the centre of the dash face. */
function toggles(x: number, y: number, z: number): THREE.BufferGeometry[] {
  const lever = (i: number) => box(0, 0.011, 0, 0.006, 0.022, 0.006, 0xc9ccd0).rotateX(i % 2 ? -0.45 : 0.45).translate(x - 0.05 + i * 0.033, y, z - 0.012);
  return [box(x, y, z - 0.004, 0.15, 0.045, 0.008, 0x55585d), ...[0, 1, 2, 3].map(lever)];
}

/** Floor lever on the tunnel (static): boot, thin chrome shaft about 0.30 m long and a white ball knob. */
function gearLever(x: number, z: number): THREE.BufferGeometry {
  const base = new THREE.Vector3(x, 0.3, z);
  const tip = new THREE.Vector3(x, 0.6, z - 0.04);
  const dir = tip.clone().sub(base).normalize();
  const boot = tint(new THREE.CylinderGeometry(0.03, 0.06, 0.09, 12).translate(x, 0.305, z), 0x121213);
  const ball = tint(new THREE.SphereGeometry(0.0225, 12, 8).translate(tip.x, tip.y, tip.z).translate(dir.x * 0.018, dir.y * 0.018, dir.z * 0.018), 0xf2f1ea);
  return merge([boot, tube([base, tip], 0.006, 0xc9ccd0, { radial: 6, perPoint: 2 }), ball]);
}

export function classicCockpit(p: BodyProfile, cv: CurveSet, eye: THREE.Vector3): ClassicCockpit {
  const zF = eye.z + 0.74; // upright dash face
  const top = cv.glassBaseY(zF + 0.2) - 0.04;
  const zEnd = p.z.cowl + 0.02;
  const body = tint(extrude([[zF, 0.5], [zF, top - 0.02], [zF + 0.015, top], [zEnd, top], [zEnd, 0.5]], HALF_W * 2, (a, b, d) => [d - HALF_W, b, a]), BLACK);
  const face = zF - 0.003;
  // Silver-grey face panel inside the black surround, glovebox seam and latch, end vents.
  const panel = [
    box(-0.01, 0.71, face, 1.26, 0.26, 0.006, FACE),
    box(0.05, 0.71, face - 0.0035, 0.004, 0.24, 0.002, 0x2a2b2e),
    box(0.45, 0.79, face - 0.0035, 0.03, 0.012, 0.004, BLACK),
    box(-0.6, 0.71, face - 0.004, 0.05, 0.07, 0.003, 0x242528),
    box(0.585, 0.71, face - 0.004, 0.05, 0.07, 0.003, 0x242528),
  ];
  // Binnacle on the face in front of the driver: tachometer ahead, speedometer towards the car's centre.
  const bz = zF - 0.058;
  const tach = new THREE.Vector2(eye.x, 0.8);
  const speedo = new THREE.Vector2(eye.x + PITCH, 0.8);
  const binnacle = [
    box(eye.x + 0.125, 0.8, zF - 0.0305, 0.44, 0.26, 0.055, 0x131315),
    box(eye.x + 0.125, 0.936, zF - 0.0375, 0.46, 0.012, 0.075, 0x131315),
    bezel(tach.x, tach.y, bz),
    bezel(speedo.x, speedo.y, bz),
  ];
  const tunnel = box(0.03, 0.18, (eye.z - 0.05 + zF - 0.02) / 2, 0.32, 0.16, zF - 0.02 - (eye.z - 0.05), 0x232427);
  const leverX = eye.x + 0.3;
  return {
    dash: { geo: merge([body, ...panel, ...binnacle, tunnel]), top, rearZ: zF },
    detail: merge([...smallDial(eye.x + 0.29, 0.83, bz, 0.5), ...smallDial(eye.x + 0.29, 0.77, bz, -0.7), ...toggles(0.1, 0.53, zF)]),
    dials: dialQuads(tach, speedo, bz - 0.0072),
    lever: gearLever(leverX, eye.z + 0.24),
  };
}
