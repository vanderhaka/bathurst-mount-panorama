import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { box } from '@/props/core/shapes';
import { StructureParts, V } from '@/props/structures/parts';

// Large white hillside letters built from a block stroke font (4 x 6 grid):
// each stroke is an extruded bar with square caps; letters face +Z, lean back
// slightly against the slope and stand on small rear props.

type Stroke = Array<[number, number]>;
const O: Stroke = [[1, 0], [0, 1], [0, 5], [1, 6], [3, 6], [4, 5], [4, 1], [3, 0], [1, 0]];
const P: Stroke[] = [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]]];

const FONT: Record<string, Stroke[]> = {
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 3], [4, 3]]],
  B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [1, 6], [0, 5], [0, 1], [1, 0], [4, 0]]],
  D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]],
  F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 1], [1, 0], [3, 0], [4, 1], [4, 3], [2, 3]]],
  H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  I: [[[2, 0], [2, 6]], [[1, 6], [3, 6]], [[1, 0], [3, 0]]],
  J: [[[4, 6], [4, 1], [3, 0], [1, 0], [0, 1]]],
  K: [[[0, 0], [0, 6]], [[4, 6], [0, 2]], [[1.4, 3.4], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]],
  M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]],
  N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  O: [O],
  P,
  Q: [O, [[2.5, 1.5], [4, 0]]],
  R: [...P, [[2, 3], [4, 0]]],
  S: [[[4, 5], [3, 6], [1, 6], [0, 5], [0, 4], [1, 3], [3, 3], [4, 2], [4, 1], [3, 0], [1, 0], [0, 1]]],
  T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 1], [1, 0], [3, 0], [4, 1], [4, 6]]],
  V: [[[0, 6], [2, 0], [4, 6]]],
  W: [[[0, 6], [1, 0], [2, 3], [3, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]],
  Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]],
  Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  '0': [O],
  '1': [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
};

/** Bar of width t and depth d from a to b (in the letter plane), with square end caps. */
function bar(a: THREE.Vector2, b: THREE.Vector2, t: number, d: number): THREE.BufferGeometry {
  const len = a.distanceTo(b) + t;
  const g = box(len, t, d);
  g.rotateZ(Math.atan2(b.y - a.y, b.x - a.x));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
  return g;
}

export function buildHillsideLetters(opts: { text: string; letterHeight: number }): THREE.Group {
  const hgt = Math.max(0.5, opts.letterHeight);
  const unit = hgt / 6.9; // grid units incl. stroke thickness
  const t = unit * 1.15;
  const depth = Math.max(0.2, hgt * 0.07);
  const lean = 0.17;
  const p = new StructureParts();
  const text = opts.text.toUpperCase();
  const advance = 5.4 * unit;
  const widths = [...text].map((ch) => (ch === ' ' ? 3 * unit : advance));
  const total = widths.reduce((a, b) => a + b, 0) - (advance - 4 * unit);
  let x = -total / 2;
  const tilt = new THREE.Matrix4().makeRotationX(-lean);
  for (const ch of text) {
    const strokes = FONT[ch];
    if (strokes) {
      for (const s of strokes) {
        for (let i = 0; i < s.length - 1; i++) {
          const a = new THREE.Vector2(x + (s[i][0] + 0.45) * unit, (s[i][1] + 0.45) * unit);
          const b = new THREE.Vector2(x + (s[i + 1][0] + 0.45) * unit, (s[i + 1][1] + 0.45) * unit);
          p.base.add(bar(a, b, t, depth).applyMatrix4(tilt), BUILDING.white);
        }
      }
      // Two rear props per letter.
      for (const px of [1, 3.5]) {
        const top = new THREE.Vector3(x + px * unit, hgt * 0.62, -depth / 2).applyMatrix4(tilt);
        p.beam(top, V(top.x, 0, top.z - hgt * 0.3), unit * 0.12, TRACKSIDE.concrete);
      }
    }
    x += ch === ' ' ? 3 * unit : advance;
  }
  return p.toGroup('hillside-letters');
}
