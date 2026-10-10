import * as THREE from 'three';
import { Mesher } from '@/props/core/mesher';
import { clampBelow } from '@/props/core/prims';
import { createRng, type Rng } from '@/props/core/rng';
import { PROPS_LOOK } from '@/props/look';
import type { BuiltProp } from '@/props/kinds-types';

// Weathered Cutting sandstone: smooth-shaded noise-displaced stones, rust on the upper
// faces, lichen patches, dark crevices and a soil-dark base where the stone is buried.

type Stone = [x: number, z: number, radius: number, heightScale: number, detail: number];

const STONES: Stone[][] = [
  [[0, 0, 0.7, 0.75, 1]],
  [[0, 0, 1.4, 0.6, 1]],
  [[0, 0, 0.9, 0.7, 1], [0.95, 0.3, 0.5, 0.8, 1], [-0.6, 0.7, 0.35, 0.8, 1]],
  [[0, 0, 1.9, 0.35, 1]],
  [[0, 0, 0.45, 0.8, 1], [0.5, -0.2, 0.3, 0.9, 0], [-0.3, 0.4, 0.25, 0.8, 0]],
  [[0, 0, 1.1, 0.95, 1], [-1.0, 0.5, 0.55, 0.7, 1]],
];

const hash = (x: number, y: number, z: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Smooth 3D value noise in [-1, 1]. */
function noise3(x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const c = (a: number, b: number, d: number) => hash(ix + a, iy + b, iz + d);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}

/** Three octaves over a unit direction; the same function drives shape and crevice colour. */
function field(d: THREE.Vector3, o: THREE.Vector3): number {
  const ridge = 1 - 2 * Math.abs(noise3(d.x * 2.2 + o.z, d.y * 2.2 + o.x, d.z * 2.2 + o.y)); // sharp bedding-like folds
  return 0.45 * noise3(d.x * 1.4 + o.x, d.y * 1.4 + o.y, d.z * 1.4 + o.z)
    + 0.25 * ridge
    + 0.2 * noise3(d.x * 3.1 + o.y, d.y * 3.1 + o.z, d.z * 3.1 + o.x)
    + 0.1 * noise3(d.x * 7 + o.z, d.y * 7 + o.x, d.z * 7 + o.y);
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function stoneGeometry(radius: number, hs: number, detail: number, rng: Rng, o: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.getAttribute('position');
  const d = new THREE.Vector3();
  const amount = detail > 0 ? 0.42 : 0.3;
  const sx = 1 + rng() * 0.25;
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const k = 1 + amount * field(d, o);
    pos.setXYZ(i, d.x * k * radius * sx, d.y * k * radius * hs, d.z * k * radius);
  }
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  return g;
}

/** Weathered sandstone boulders: single stones, slabs and small clusters. Base sits at y = 0. */
export function buildRock(variant: number): BuiltProp {
  const look = PROPS_LOOK.rock;
  const rng = createRng(500 + variant * 29);
  const m = new Mesher();
  const rust = new THREE.Color().setHex(look.rust);
  const lichen = new THREE.Color().setHex(look.lichen);
  const soil = new THREE.Color().setHex(look.soil);
  let top = 0;
  for (const [x, z, r, hs, detail] of STONES[variant]) {
    const o = new THREE.Vector3(rng() * 40, rng() * 40, rng() * 40);
    const g = stoneGeometry(r, hs, detail, rng, o);
    g.rotateY(rng() * Math.PI);
    g.translate(x, r * hs * 0.55, z);
    clampBelow(g);
    const centre = new THREE.Vector3(x, r * hs * 0.55, z);
    const height = r * hs * 1.5;
    top = Math.max(top, height);
    const base = new THREE.Color().setHex(look.colours[variant % look.colours.length]).multiplyScalar(0.8 + rng() * 0.2);
    const warm = new THREE.Color().setHex(look.colours[0]).lerp(rust, 0.2);
    const dir = new THREE.Vector3();
    const c = new THREE.Color();
    const vertexColour = (p: THREE.Vector3, n: THREE.Vector3) => {
      dir.copy(p).sub(centre).normalize();
      const cavity = field(dir, o);
      const patch = noise3(p.x * 2.3 + o.x, p.y * 2.3 + o.y, p.z * 2.3 + o.z);
      c.copy(base).lerp(warm, 0.5 + 0.5 * noise3(p.x * 0.9 + o.z, p.y * 0.9, p.z * 0.9 + o.x));
      c.multiplyScalar(0.9 + 0.2 * noise3(p.x * 5 + o.y, p.y * 5 + o.z, p.z * 5 + o.x));
      c.lerp(rust, smooth(0.2, 0.8, n.y) * (0.5 + 0.35 * patch));
      c.lerp(lichen, smooth(0.05, 0.45, patch) * smooth(0.2, 0.6, n.y) * 0.7);
      // Crevices: surface turned down or sunk below the average shape.
      c.multiplyScalar(1 - 0.45 * smooth(0, 0.7, -n.y) - 0.5 * smooth(0.0, 0.35, -cavity));
      c.multiplyScalar(1 + 0.12 * patch);
      // Contact band: buried base is stained dark with soil.
      const hRel = p.y / height;
      c.lerp(soil, 0.8 * (1 - smooth(0.1, 0.5, hRel)));
      return c;
    };
    m.add(g, base, { smooth: true, vertexColour });
  }
  return { geometry: m.build(), height: top };
}
