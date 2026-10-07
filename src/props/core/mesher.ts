import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROPS_LOOK } from '@/props/look';

/** Information about one triangle, handed to colour functions. */
export interface FaceInfo {
  centroid: THREE.Vector3;
  normal: THREE.Vector3;
  /** Triangle index inside the part. */
  index: number;
}

export type FaceColour = number | THREE.Color | ((face: FaceInfo) => number | THREE.Color);

export interface AddOptions {
  /** Per-face brightness jitter (0..1). */
  jitter?: number;
  /**
   * Tintable faces (the instance colour shows through; paint them white).
   * true = the whole part; 'white' = only the faces whose colour is exactly 0xffffff.
   */
  tint?: boolean | 'white';
  /** Seed for the jitter. */
  seed?: number;
  /** Keep this part flat-shaded even when the look asks for smooth shading. */
  forceFlat?: boolean;
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpCol = new THREE.Color();

/**
 * Collects coloured parts and merges them into ONE non-indexed geometry with
 * `position`, `normal`, `color` (linear) and, for tintable assets, `tintMask`.
 */
export class Mesher {
  private parts: THREE.BufferGeometry[] = [];
  private seed = 1;

  constructor(readonly tintable = false) {}

  get triangles(): number {
    let n = 0;
    for (const p of this.parts) n += p.getAttribute('position').count / 3;
    return n;
  }

  get isEmpty(): boolean {
    return this.parts.length === 0;
  }

  /** Adds a part (already placed in prop space). The source geometry is not modified. */
  add(source: THREE.BufferGeometry, colour: FaceColour, opts: AddOptions = {}): this {
    const flat = source.index ? source.toNonIndexed() : source;
    const srcPos = flat.getAttribute('position');
    const keep: number[] = [];
    for (let i = 0; i < srcPos.count; i += 3) {
      tmpA.fromBufferAttribute(srcPos, i);
      tmpB.fromBufferAttribute(srcPos, i + 1);
      tmpC.fromBufferAttribute(srcPos, i + 2);
      const area = tmpB.sub(tmpA).cross(tmpC.sub(tmpA)).lengthSq();
      if (area > 1e-12) keep.push(i);
    }
    const pos = new Float32Array(keep.length * 9);
    keep.forEach((v, k) => {
      for (let j = 0; j < 3; j++) {
        pos[k * 9 + j * 3] = srcPos.getX(v + j);
        pos[k * 9 + j * 3 + 1] = srcPos.getY(v + j);
        pos[k * 9 + j * 3 + 2] = srcPos.getZ(v + j);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    if (!PROPS_LOOK.shading.flat && !opts.forceFlat) smoothNormals(g);
    const whiteFaces = this.paint(g, colour, opts);
    if (this.tintable) {
      const mask = new Float32Array(keep.length * 3);
      if (opts.tint === true) mask.fill(1);
      else if (opts.tint === 'white') whiteFaces.forEach((f) => mask.fill(1, f * 3, f * 3 + 3));
      g.setAttribute('tintMask', new THREE.BufferAttribute(mask, 1));
    }
    if (flat !== source) flat.dispose();
    this.parts.push(g);
    return this;
  }

  /** Adds every part of another mesher (for re-use of sub-assemblies). */
  addMesher(other: Mesher, matrix?: THREE.Matrix4): this {
    for (const p of other.parts) {
      const g = p.clone();
      if (matrix) g.applyMatrix4(matrix);
      if (this.tintable && !g.getAttribute('tintMask')) {
        g.setAttribute('tintMask', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
      }
      if (!this.tintable) g.deleteAttribute('tintMask');
      this.parts.push(g);
    }
    return this;
  }

  /** Merges all parts. Returns an empty geometry (with the right attributes) when nothing was added. */
  build(): THREE.BufferGeometry {
    if (this.parts.length === 0) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(0), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
      return g;
    }
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw new Error('Mesher: parts have mismatched attributes');
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return merged;
  }

  /** Writes per-face colours; returns the indices of faces painted pure white. */
  private paint(g: THREE.BufferGeometry, colour: FaceColour, opts: AddOptions): number[] {
    const white: number[] = [];
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const jitter = opts.jitter ?? 0;
    let s = (opts.seed ?? this.seed++) * 7919 + 13;
    const info: FaceInfo = { centroid: new THREE.Vector3(), normal: new THREE.Vector3(), index: 0 };
    for (let f = 0; f < pos.count / 3; f++) {
      const v = f * 3;
      if (typeof colour === 'function') {
        info.centroid.set(
          (pos.getX(v) + pos.getX(v + 1) + pos.getX(v + 2)) / 3,
          (pos.getY(v) + pos.getY(v + 1) + pos.getY(v + 2)) / 3,
          (pos.getZ(v) + pos.getZ(v + 1) + pos.getZ(v + 2)) / 3,
        );
        tmpA.fromBufferAttribute(pos, v);
        tmpB.fromBufferAttribute(pos, v + 1).sub(tmpA);
        tmpC.fromBufferAttribute(pos, v + 2).sub(tmpA);
        info.normal.crossVectors(tmpB, tmpC).normalize();
        info.index = f;
        const c = colour(info);
        if (typeof c === 'number') tmpCol.setHex(c);
        else tmpCol.copy(c);
      } else if (typeof colour === 'number') tmpCol.setHex(colour);
      else tmpCol.copy(colour);
      if (tmpCol.r === 1 && tmpCol.g === 1 && tmpCol.b === 1) white.push(f);
      let k = 1;
      if (jitter > 0) {
        s = (s * 16807) % 2147483647;
        k = 1 + ((s / 2147483647) * 2 - 1) * jitter;
      }
      for (let j = 0; j < 3; j++) {
        col[(v + j) * 3] = tmpCol.r * k;
        col[(v + j) * 3 + 1] = tmpCol.g * k;
        col[(v + j) * 3 + 2] = tmpCol.b * k;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return white;
  }
}

/** Averages face normals of coincident vertices inside one part (smooth shading option). */
function smoothNormals(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const acc = new Map<string, THREE.Vector3>();
  const key = (i: number) => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const n = acc.get(k) ?? acc.set(k, new THREE.Vector3()).get(k)!;
    n.x += nor.getX(i);
    n.y += nor.getY(i);
    n.z += nor.getZ(i);
  }
  for (let i = 0; i < pos.count; i++) {
    const n = acc.get(key(i))!.clone().normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
}

/** sRGB hex → linear THREE.Color scaled by brightness k. */
export function shade(hex: number, k = 1): THREE.Color {
  return new THREE.Color().setHex(hex).multiplyScalar(k);
}

/** Linear blend of two sRGB hex colours, returned as a linear Color. */
export function mixHex(a: number, b: number, t: number): THREE.Color {
  return new THREE.Color().setHex(a).lerp(new THREE.Color().setHex(b), t);
}
