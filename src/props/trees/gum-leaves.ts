import * as THREE from 'three';
import { createRng } from '@/props/core/rng';
import type { CrownShape } from '@/props/trees/gum-crown';

const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Lanceolate leaves over a dense connected core; only the outer rim has gaps. */
export function generateLeafTile(size: number, seed: number, crown = false): Uint8Array {
  const rng = createRng(seed), leaves = new Float32Array(size * size), tones = new Float32Array(size * size).fill(1);
  for (let l = 0; l < 850; l++) {
    const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.95;
    const cx = (0.5 + Math.cos(a) * r * 0.5) * size, cy = (0.5 + Math.sin(a) * r * 0.5) * size;
    const angle = rng() * Math.PI + 0.3, c = Math.cos(angle), s = Math.sin(angle);
    const length = size * rng.range(0.018, 0.05), width = length * rng.range(0.17, 0.25), radius = Math.ceil(length + 1);
    const tint = rng.range(0.88, 1);
    for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(size, cy + radius); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(size, cx + radius); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const along = (dx * c + dy * s) / length, across = (-dx * s + dy * c) / width;
        const taper = Math.max(0.001, 1 - Math.abs(along) ** 1.35);
        const coverage = clamp((1 - Math.max(Math.abs(along), Math.abs(across) / taper)) * Math.max(1, width) + 0.5);
        const i = y * size + x;
        if (coverage > leaves[i]) { leaves[i] = coverage; tones[i] = Math.abs(across) < 0.1 ? 1 : tint; }
      }
    }
  }
  const data = new Uint8Array(size * size * 4), phase = rng() * Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
    const angle = Math.atan2(v, u), radius = Math.hypot(u, v), i = y * size + x, k = i * 4;
    const rim = 0.94 + 0.025 * Math.sin(angle * (crown ? 5 : 7) + phase) + 0.016 * Math.sin(angle * 13 - phase);
    const envelope = clamp((rim - radius) * size * 0.4 + 0.5);
    const core = clamp((0.80 - radius) * size * 0.4 + 0.5);
    const alpha = envelope * (core + (1 - core) * (0.58 + leaves[i] * 0.42));
    const tone = 1 - leaves[i] * (1 - tones[i]);
    for (let j = 0; j < 3; j++) data[k + j] = Math.round(tone * 255);
    data[k + 3] = Math.round(alpha * 255);
  }
  return data;
}

/** Six intersecting oval cards, never horizontal parasol pads. 12 triangles. */
export function crownCards(shape: CrownShape, phase = 0, tile = 2): THREE.BufferGeometry {
  const position: number[] = [], uv: number[] = [];
  const { centre, radii } = shape;
  for (let i = 0; i < 6; i++) {
    const a = phase + i * Math.PI / 6, c = Math.cos(a), s = Math.sin(a);
    const radius = 1 / Math.hypot(c / radii.x, s / radii.z);
    const right = new THREE.Vector3(c * radius, 0, s * radius), up = new THREE.Vector3(0, radii.y, 0);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const;
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [x, y] = corners[index], p = centre.clone().addScaledVector(right, x).addScaledVector(up, y);
      position.push(p.x, p.y, p.z); uv.push((x + 1) * 0.5, (y + 1) * 0.5);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('treeSurface', new THREE.Float32BufferAttribute(new Float32Array(position.length / 3).fill(tile), 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(position.length), 3));
  setCrownNormals(g, shape);
  return g;
}

/** Radial envelope coordinates, deliberately unnormalised for interpolation in the leaf shader. */
export function setCrownNormals(g: THREE.BufferGeometry, shape: CrownShape): void {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), surface = g.getAttribute('treeSurface');
  for (let i = 0; i < p.count; i++) {
    if (surface && surface.getX(i) < 2) continue;
    n.setXYZ(i, (p.getX(i) - shape.centre.x) / shape.radii.x, (p.getY(i) - shape.centre.y) / shape.radii.y, (p.getZ(i) - shape.centre.z) / shape.radii.z);
  }
}

/** Reattach card UVs after Mesher paints colours, and give wood wrap-safe metric UVs. */
export function decorateGumGeometry(g: THREE.BufferGeometry, woodVertices: number, cards: readonly THREE.BufferGeometry[], bark: 'smooth' | 'box', height: number): void {
  const p = g.getAttribute('position'), uv = new Float32Array(p.count * 2), surface = new Float32Array(p.count);
  const normals = g.getAttribute('normal'), smooth = new Map<string, THREE.Vector3>();
  const vertexKey = (i: number) => `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
  for (let i = 0; i < woodVertices; i++) {
    const key = vertexKey(i), n = smooth.get(key) ?? new THREE.Vector3();
    n.x += normals.getX(i); n.y += normals.getY(i); n.z += normals.getZ(i); smooth.set(key, n);
  }
  for (let i = 0; i < woodVertices; i++) { const n = smooth.get(vertexKey(i))!.clone().normalize(); normals.setXYZ(i, n.x, n.y, n.z); }
  surface.fill(bark === 'box' ? 1 : 0, 0, woodVertices);
  for (let i = 0; i < woodVertices; i += 3) {
    const around = [0, 1, 2].map((j) => Math.atan2(p.getZ(i + j), p.getX(i + j)) / (Math.PI * 2) + 0.5);
    const seam = Math.max(...around) - Math.min(...around) > 0.5;
    for (let j = 0; j < 3; j++) { uv[(i + j) * 2] = around[j] + (seam && around[j] < 0.5 ? 1 : 0); uv[(i + j) * 2 + 1] = p.getY(i + j) / 2; }
  }
  let at = woodVertices;
  for (const card of cards) {
    const count = card.getAttribute('position').count;
    uv.set(card.getAttribute('uv').array, at * 2); surface.set(card.getAttribute('treeSurface').array, at);
    for (let i = 0; i < count; i++) { const n = card.getAttribute('normal'); normals.setXYZ(at + i, n.getX(i), n.getY(i), n.getZ(i)); }
    at += count;
  }
  if (at !== p.count) throw new Error('Gum cards: painted geometry lost vertices');
  const wind = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const y = clamp(p.getY(i) / height);
    wind[i * 2] = y * y * Math.min(1, height / 12); wind[i * 2 + 1] = surface[i] >= 2 ? y * Math.min(1, height / 4) : 0;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('treeSurface', new THREE.BufferAttribute(surface, 1));
  g.setAttribute('treeWind', new THREE.BufferAttribute(wind, 2));
}
