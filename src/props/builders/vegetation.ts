import * as THREE from 'three';
import { Mesher, type FaceInfo } from '@/props/core/mesher';
import { clampBelow } from '@/props/core/prims';
import { createRng } from '@/props/core/rng';
import { blob, tube } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';

// Shrubs, granite boulders and grass tussocks.

export const VEGETATION_VARIANTS = { shrub: 6, rock: 6, grassTuft: 5 } as const;

function shadedFoliage(base: THREE.Color, under: number) {
  return (f: FaceInfo) => base.clone().multiplyScalar(f.normal.y < 0 ? 1 - under * -f.normal.y : 1 + 0.06 * f.normal.y);
}

/** Low native shrub: 2-5 overlapping lumpy clumps, flat on the ground. */
export function buildShrub(variant: number): BuiltProp {
  const look = PROPS_LOOK.shrub;
  const rng = createRng(300 + variant * 17);
  const m = new Mesher();
  const size = [1.2, 1.8, 0.9, 2.4, 1.5, 1.1][variant];
  const lumps = Math.min(12, Math.round(size * 3.6) + 2);
  const base = new THREE.Color().setHex(look.colours[variant % look.colours.length]).multiplyScalar(1.12);
  const wide = variant === 3 ? 1.35 : 1;
  for (let i = 0; i < lumps; i++) {
    // Many small lumps over a dome: an irregular bush, not one big gem.
    const a = (i / lumps) * Math.PI * 2 * 2.4 + rng();
    const t = i / lumps;
    const d = size * 0.42 * wide * Math.sqrt(1 - t) * (0.7 + rng() * 0.4);
    const r = size * (0.2 + rng() * 0.1) * (i === 0 ? 1.3 : 1);
    const lift = size * (0.12 + 0.55 * t) + rng() * size * 0.1;
    const g = blob(new THREE.Vector3(r, r * (0.75 + rng() * 0.3), r), 0, rng, 0.25, 0.75);
    g.rotateY(rng() * 3);
    g.translate(Math.cos(a) * d, lift, Math.sin(a) * d);
    const c = base.clone().multiplyScalar(0.88 + rng() * 0.24);
    m.add(clampBelow(g), shadedFoliage(c, 0.3), { jitter: look.faceJitter });
  }
  if (variant === 2) {
    // Sapling-like shrub on a short stem.
    m.add(tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.5, 0)], [0.05, 0.035], 4), PROPS_LOOK.eucalyptus.bark);
  }
  return { geometry: m.build() };
}

/** Granite boulders: single rounded stones, slabs and small clusters, lichen on top faces. */
export function buildRock(variant: number): BuiltProp {
  const look = PROPS_LOOK.rock;
  const rng = createRng(500 + variant * 29);
  const m = new Mesher();
  const base = new THREE.Color().setHex(look.colours[variant % look.colours.length]);
  const lichen = new THREE.Color().setHex(look.lichen);
  const colour = (f: FaceInfo) => {
    const c = base.clone();
    if (f.normal.y > 0.55 && Math.sin(f.centroid.x * 7 + f.centroid.z * 5) > 0.2) c.lerp(lichen, 0.45);
    return c.multiplyScalar(f.normal.y < -0.1 ? 0.7 : 1);
  };
  const stones: Array<[number, number, number, number, number]> = [
    // x, z, radius, height scale, detail
    ...([
      [[0, 0, 0.7, 0.75, 1]],
      [[0, 0, 1.4, 0.6, 1]],
      [[0, 0, 0.9, 0.7, 1], [0.95, 0.3, 0.5, 0.8, 0], [-0.6, 0.7, 0.35, 0.8, 0]],
      [[0, 0, 1.9, 0.35, 1]],
      [[0, 0, 0.45, 0.8, 0], [0.5, -0.2, 0.3, 0.9, 0], [-0.3, 0.4, 0.25, 0.8, 0]],
      [[0, 0, 1.1, 0.95, 1], [-1.0, 0.5, 0.55, 0.7, 0]],
    ][variant] as Array<[number, number, number, number, number]>),
  ];
  for (const [x, z, r, hs, detail] of stones) {
    const g = blob(new THREE.Vector3(r * (1 + rng() * 0.25), r * hs, r), detail, rng, detail ? 0.16 : 0.2, 1);
    g.rotateY(rng() * Math.PI);
    g.translate(x, r * hs * 0.55, z);
    m.add(clampBelow(g), colour, { jitter: 0.07 });
  }
  return { geometry: m.build() };
}

/** Grass tussock: a fan of thin double-sided blades; dry variants are straw coloured. */
export function buildGrassTuft(variant: number): BuiltProp {
  const look = PROPS_LOOK.grass;
  const rng = createRng(700 + variant * 13);
  const m = new Mesher();
  const blades = [20, 22, 16, 14, 24][variant];
  const height = [0.45, 0.6, 0.35, 0.85, 0.3][variant];
  const cols = [look.colours[0], look.colours[2], look.colours[1], look.colours[2], look.colours[3]];
  const base = new THREE.Color().setHex(cols[variant]);
  const alt = new THREE.Color().setHex(variant === 1 || variant === 3 ? look.colours[0] : look.colours[2]);
  const pts: number[] = [];
  const colours: THREE.Color[] = [];
  for (let i = 0; i < blades; i++) {
    const a = rng() * Math.PI * 2;
    const lean = 0.2 + rng() * 0.55;
    const h = height * (0.6 + rng() * 0.5);
    const w = 0.035 + rng() * 0.03;
    const ox = Math.cos(a) * 0.08 * rng();
    const oz = Math.sin(a) * 0.08 * rng();
    const tip = new THREE.Vector3(ox + Math.cos(a) * h * lean, h, oz + Math.sin(a) * h * lean);
    const px = -Math.sin(a) * w;
    const pz = Math.cos(a) * w;
    const b0 = new THREE.Vector3(ox - px, 0, oz - pz);
    const b1 = new THREE.Vector3(ox + px, 0, oz + pz);
    pts.push(b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, tip.x, tip.y, tip.z, b1.x, b1.y, b1.z, b0.x, b0.y, b0.z, tip.x, tip.y, tip.z);
    const c = base.clone().lerp(alt, rng() * 0.35).multiplyScalar(0.85 + rng() * 0.3);
    colours.push(c, c);
  }
  if (variant === 3) {
    // Seed heads on tall stalks.
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2;
      const top = new THREE.Vector3(Math.cos(a) * 0.15, height * 1.25, Math.sin(a) * 0.15);
      pts.push(-0.01, 0, 0, 0.01, 0, 0, top.x, top.y, top.z, 0.01, 0, 0, -0.01, 0, 0, top.x, top.y, top.z);
      colours.push(base.clone().multiplyScalar(1.1), base.clone().multiplyScalar(1.1));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  let k = 0;
  m.add(g, () => colours[k++]);
  return { geometry: m.build(), radius: height * 0.6, height: height * 1.1 };
}
