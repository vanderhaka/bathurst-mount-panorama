import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, GROUND, ROAD, SKY, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { cylinderZ } from '@/props/core/prims';
import { box } from '@/props/core/shapes';
import { addSegmentText, StructureParts, V } from '@/props/structures/parts';

// Start/finish gantry (box truss across the track, start lights, timing board)
// and the big video screen on legs. Both face +Z.

/** Box truss along X between x0 and x1, bottom at y, height h, depth d (centred on z = 0). */
function boxTruss(p: StructureParts, x0: number, x1: number, y: number, h: number, d: number, colour: number): void {
  const chords = [[y, -d / 2], [y, d / 2], [y + h, -d / 2], [y + h, d / 2]];
  for (const [cy, cz] of chords) p.beam(V(x0, cy, cz), V(x1, cy, cz), 0.07, colour);
  const n = Math.max(2, Math.round((x1 - x0) / 1.6));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    for (const z of [-d / 2, d / 2]) p.beam(V(x, y, z), V(x, y + h, z), 0.04, colour);
    p.beam(V(x, y, -d / 2), V(x, y, d / 2), 0.035, colour);
    p.beam(V(x, y + h, -d / 2), V(x, y + h, d / 2), 0.035, colour);
    if (i < n) {
      const xn = x0 + ((x1 - x0) * (i + 1)) / n;
      for (const z of [-d / 2, d / 2]) p.beam(i % 2 ? V(x, y, z) : V(x, y + h, z), i % 2 ? V(xn, y + h, z) : V(xn, y, z), 0.03, colour);
    }
  }
}

export function buildStartGantry(opts: { span: number; height: number }): THREE.Group {
  const S = Math.max(8, opts.span);
  const H = Math.max(4.5, opts.height);
  const p = new StructureParts();
  const steel = BUILDING.darkGrey;
  const half = S / 2 + 0.7;
  // Columns with base plates and a concrete footing.
  for (const s of [-1, 1]) {
    p.block(0.8, H + 1.9, 0.8, s * half, 0, 0, BUILDING.grey, 0.01);
    p.block(1.4, 0.4, 1.4, s * half, 0, 0, TRACKSIDE.concrete);
  }
  boxTruss(p, -half, half, H, 1.6, 1.2, steel);
  // Fascia panels on both faces, leaving the middle for the lights.
  for (const z of [0.66, -0.66]) {
    for (const s of [-1, 1]) {
      const w = S / 2 - 2.2;
      p.block(w, 1.3, 0.06, s * (2.2 + w / 2), H + 0.15, z, BUILDING.white);
      p.block(w, 0.22, 0.07, s * (2.2 + w / 2), H + 0.15, z, BUILDING.accentRed);
    }
  }
  // Start-light panels on both faces (the grid sees the -Z face): five columns of two lenses.
  for (const f of [1, -1]) {
    p.block(3.4, 1.3, 0.3, 0, H - 1.05, f * 0.55, TRACKSIDE.tyre);
    for (let c = 0; c < 5; c++) {
      for (const y of LENS_ROWS(H)) p.base.add(box(0.5, 0.06, 0.18, -1.3 + c * 0.65, y + 0.26, f * 0.8), TRACKSIDE.tyre);
    }
  }
  // Timing board on top of the truss.
  const by = H + 1.6;
  p.block(6.4, 1.5, 0.4, 0, by, 0, TRACKSIDE.tyre);
  for (const x of [-2.5, 2.5]) p.beam(V(x, H + 1.6, 0), V(x, by + 0.1, 0), 0.06, steel);
  const amber = new THREE.Color().setHex(BUILDING.accentYellow).multiplyScalar(1.15);
  // Digits on the front face, then the same digits turned round for the back face.
  const digits = new Mesher();
  const tw = addSegmentText(digits, '2:04.9', 0, by + 0.3, 0.21, 0.9, amber);
  const centre = new THREE.Matrix4().makeTranslation(-tw / 2, 0, 0);
  p.light.addMesher(digits, centre);
  p.light.addMesher(digits, new THREE.Matrix4().makeRotationY(Math.PI).multiply(centre));
  const group = p.toGroup('start-gantry');
  group.add(buildStartLights(H));
  return group;
}

const LENS_ROWS = (H: number) => [H - 0.12, H - 0.68];

/**
 * The start lights: one mesh per column (lenses on both faces). `userData.setLit(n)`
 * lights columns 1..n; the race controller calls it every frame with the light count.
 */
function buildStartLights(H: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'start-lights';
  const mats: THREE.MeshStandardMaterial[] = [];
  for (let c = 0; c < 5; c++) {
    const x = -1.3 + c * 0.65;
    const lenses: THREE.BufferGeometry[] = [];
    // Column 1 is on the left as seen from each side, so the -Z face is mirrored.
    for (const y of LENS_ROWS(H)) for (const z of [0.72, -0.72]) lenses.push(cylinderZ(0.2, 0.06, 12, z > 0 ? x : -x, y, z));
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a0808, emissive: 0xff0a04, emissiveIntensity: 0, roughness: 0.35 });
    mats.push(mat);
    g.add(new THREE.Mesh(mergeGeometries(lenses), mat));
  }
  g.userData.setLit = (n: number) => mats.forEach((m, c) => { m.emissiveIntensity = c < n ? 1.25 : 0; });
  return g;
}

/** Broadcast-style picture as a grid of emissive cells: sky, hills, track with two cars, a timing tower and a lower-third bar. */
function screenImage(p: StructureParts, W: number, H: number, y0: number, z: number): void {
  const cols = 48;
  const rows = 27;
  const sky = new THREE.Color().setHex(SKY.mid);
  const skyTop = new THREE.Color().setHex(SKY.zenith);
  const hill = new THREE.Color().setHex(GROUND.grassDark);
  const grass = new THREE.Color().setHex(GROUND.grass);
  const road = new THREE.Color().setHex(ROAD.asphaltWorn);
  const kerb = new THREE.Color().setHex(ROAD.kerbRed);
  const carA = new THREE.Color().setHex(BUILDING.accentRed);
  const carB = new THREE.Color().setHex(BUILDING.accentBlue);
  const panel = new THREE.Color(0.06, 0.07, 0.09);
  const rowLight = new THREE.Color(0.82, 0.84, 0.86);
  const bar = new THREE.Color().setHex(BUILDING.accentBlue).multiplyScalar(0.8);
  const colourAt = (u: number, v: number): THREE.Color => {
    // Lower-third bar and the timing tower overlay.
    if (v < 0.13 && u > 0.18 && u < 0.82) return u < 0.3 ? new THREE.Color().setHex(BUILDING.accentYellow) : v > 0.075 ? bar : rowLight;
    if (u < 0.17 && v > 0.22 && v < 0.94) {
      const row = Math.floor((v - 0.22) / 0.06);
      if (u < 0.03) return [carA, carB, rowLight, kerb][row % 4];
      return (v - 0.22) % 0.06 < 0.012 ? panel : row % 2 ? panel.clone().multiplyScalar(2.2) : panel;
    }
    // Scene: track running diagonally across the frame.
    const trackY = 0.18 + 0.32 * u;
    const dy = v - trackY;
    if (Math.abs(dy) < 0.11) {
      const carCentreA = Math.hypot((u - 0.55) * 1.8, dy + 0.02);
      const carCentreB = Math.hypot((u - 0.78) * 1.8, dy - 0.03);
      if (carCentreA < 0.07) return carA;
      if (carCentreB < 0.06) return carB;
      return Math.abs(Math.abs(dy) - 0.1) < 0.012 ? kerb : road;
    }
    const horizon = 0.68 + 0.06 * Math.sin(u * 5.0) + 0.03 * Math.sin(u * 13.0);
    if (v < horizon) return dy < 0 ? grass.clone().multiplyScalar(0.9) : grass.clone().lerp(hill, (v - trackY) / (horizon - trackY));
    return sky.clone().lerp(skyTop, (v - horizon) / (1 - horizon));
  };
  const out: number[] = [];
  const cw = W / cols;
  const ch = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = -W / 2 + c * cw;
      const y = y0 + r * ch;
      out.push(x0, y, z, x0 + cw, y, z, x0 + cw, y + ch, z, x0, y, z, x0 + cw, y + ch, z, x0, y + ch, z);
    }
  }
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  // Colour per cell (both triangles of a cell share it), sampled at the cell centre.
  p.light.add(g, (f) => {
    const c = Math.floor((f.centroid.x + W / 2) / cw);
    const r = Math.floor((f.centroid.y - y0) / ch);
    return colourAt((c + 0.5) / cols, (r + 0.5) / rows).clone().multiplyScalar(0.92);
  });
}

export function buildVideoScreen(opts: { width: number }): THREE.Group {
  const W = Math.max(3, opts.width);
  const H = (W * 9) / 16;
  const y0 = 3.2;
  const p = new StructureParts();
  p.block(W + 0.5, H + 0.5, 0.7, 0, y0 - 0.25, -0.3, BUILDING.darkGrey);
  screenImage(p, W, H, y0, 0.07);
  // Hood above the screen.
  p.block(W + 0.7, 0.12, 1.0, 0, y0 + H + 0.25, 0.2, BUILDING.darkGrey);
  // Two lattice legs and back bracing.
  for (const s of [-1, 1]) {
    const x = s * W * 0.3;
    for (const dx of [-0.35, 0.35]) for (const dz of [-0.95, -0.35]) p.beam(V(x + dx, 0, dz), V(x + dx, y0 + H * 0.7, dz), 0.06, TRACKSIDE.fencePost);
    for (let y = 0.6; y < y0 + H * 0.6; y += 1.2) {
      p.beam(V(x - 0.35, y, -0.95), V(x + 0.35, y + 0.6, -0.95), 0.03, TRACKSIDE.fencePost);
      p.beam(V(x - 0.35, y, -0.35), V(x + 0.35, y + 0.6, -0.35), 0.03, TRACKSIDE.fencePost);
    }
    p.block(1.4, 0.35, 1.2, x, 0, -0.65, TRACKSIDE.concrete);
    p.beam(V(x, 0.3, -2.8), V(x, y0 + H * 0.5, -0.7), 0.07, TRACKSIDE.fencePost);
  }
  return p.toGroup('video-screen');
}
