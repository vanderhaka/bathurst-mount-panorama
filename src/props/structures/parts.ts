import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { Mesher } from '@/props/core/mesher';
import { emissiveMaterial, glassMaterial, metalMaterial, propMaterial } from '@/props/core/materials';
import { box, extrude, strut } from '@/props/core/shapes';

// Accumulates a structure's parts per material and turns them into a Group with
// one merged mesh per material (a handful of draw calls per structure).

export class StructureParts {
  readonly base = new Mesher();
  readonly glass = new Mesher();
  readonly metal = new Mesher();
  readonly light = new Mesher();

  /** Box centred at (x, y, z) on the base material. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, colour: number | THREE.Color, jitter = 0): this {
    this.base.add(box(w, h, d, x, y, z), colour, { jitter });
    return this;
  }

  /** Box resting on y0 (bottom face at y0). */
  block(w: number, h: number, d: number, x: number, y0: number, z: number, colour: number | THREE.Color, jitter = 0): this {
    return this.box(w, h, d, x, y0 + h / 2, z, colour, jitter);
  }

  /** Steel member between two points on the metal material. */
  beam(a: THREE.Vector3, b: THREE.Vector3, r: number, colour: number, sides = 4): this {
    this.metal.add(strut(a, b, r, sides, true), colour);
    return this;
  }

  toGroup(name: string): THREE.Group {
    const g = new THREE.Group();
    g.name = name;
    const add = (m: Mesher, mat: THREE.Material, label: string, cast: boolean) => {
      if (m.isEmpty) return;
      const mesh = new THREE.Mesh(m.build(), mat);
      mesh.name = `${name}:${label}`;
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    add(this.base, propMaterial(), 'base', true);
    add(this.metal, metalMaterial(), 'metal', true);
    add(this.glass, glassMaterial(), 'glass', false);
    add(this.light, emissiveMaterial(), 'light', false);
    return g;
  }
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Seven-segment digits (and ':' / '.') as flat quads facing +Z, for timing boards. */
export function addSegmentText(m: Mesher, text: string, x0: number, y0: number, z: number, h: number, colour: number | THREE.Color): number {
  const w = h * 0.55;
  const t = h * 0.12;
  const SEG: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g' };
  const seg = (s: string): [number, number, number, number] => {
    const hh = h / 2;
    switch (s) {
      case 'a': return [0, h - t / 2, w, t];
      case 'g': return [0, hh, w, t];
      case 'd': return [0, t / 2, w, t];
      case 'b': return [w / 2 - t / 2, hh + hh / 2, t, hh - t];
      case 'c': return [w / 2 - t / 2, hh / 2, t, hh - t];
      case 'e': return [-w / 2 + t / 2, hh / 2, t, hh - t];
      default: return [-w / 2 + t / 2, hh + hh / 2, t, hh - t];
    }
  };
  let x = x0;
  for (const ch of text) {
    if (ch === ':' || ch === '.') {
      const dots = ch === ':' ? [h * 0.3, h * 0.7] : [t / 2];
      for (const dy of dots) m.add(box(t, t, 0.02, x + t, y0 + dy, z), colour);
      x += t * 3;
      continue;
    }
    for (const s of SEG[ch] ?? '') {
      const [cx, cy, sw, sh] = seg(s);
      m.add(box(sw, sh, 0.02, x + w / 2 + cx, y0 + cy, z), colour);
    }
    x += w + t * 1.6;
  }
  return x - x0;
}

/**
 * Straight concrete stair flight with handrails: top step at xTop, running down
 * along `dir` (±X) to the ground; centred on z, `width` wide.
 */
export function stairFlight(p: StructureParts, xTop: number, dir: 1 | -1, height: number, z: number, width: number): void {
  const rise = 0.17;
  const going = 0.28;
  const steps = Math.max(2, Math.ceil(height / rise));
  const r = height / steps;
  const run = steps * going;
  // Profile in (u along the run, y): stepped top edge, straight soffit.
  const outline: Array<[number, number]> = [[0, height]];
  for (let i = 0; i < steps; i++) {
    outline.push([i * going + going, height - i * r]);
    outline.push([i * going + going, height - (i + 1) * r]);
  }
  outline.push([run - 0.6, 0], [0, height - 0.6]);
  const g = extrude(outline.map(([u, y]) => [dir * u, y] as [number, number]), width).translate(xTop, 0, z - width / 2);
  p.base.add(g, (f) => (f.normal.y > 0.9 ? TRACKSIDE.concrete : BUILDING.grey), { jitter: 0.01 });
  for (const s of [-1, 1]) {
    const zz = z + (s * width) / 2;
    p.beam(V(xTop, height + 1.0, zz), V(xTop + dir * run, 1.0, zz), 0.035, TRACKSIDE.armco);
    for (let k = 0; k <= 3; k++) {
      const u = (run * k) / 3;
      const y = height - (height * u) / run;
      p.beam(V(xTop + dir * u, y, zz), V(xTop + dir * u, y + 1.0, zz), 0.025, TRACKSIDE.armco);
    }
  }
}
