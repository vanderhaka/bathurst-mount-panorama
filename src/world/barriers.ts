import * as THREE from 'three';
import { GROUND, TRACKSIDE } from '@/art/palette';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import { TYRE_WALL_DEPTH } from '@/track/apply-layout';
import type { KerbLayout } from '@/track/kerbs';
import type { SideArrays, Track } from '@/track/track-model';
import { heightAt } from '@/track/track-query';
import { fbm } from '@/world/dem';
import { VERGE_COLOURS } from '@/world/road';
import { buildStrip } from '@/world/strip';
import { chainLinkTexture, concreteTexture } from '@/world/textures';

const WALL_HEIGHT = 1.05;
const FENCE_HEIGHT = 2.6;

/** Lateral offset of the concrete wall face on one side (behind tyres where present). */
function concreteOffset(side: SideArrays, i: number): number {
  return side.wall[i] + (side.barrier[i] === 'tyres' ? TYRE_WALL_DEPTH : 0);
}

export function buildVerges(track: Track, kerbs: KerbLayout): THREE.Group {
  const g = new THREE.Group();
  g.name = 'verges';
  const mat = vertexColourMaterial({ roughness: 0.95, flat: false });
  const c2 = new THREE.Color();
  for (const sign of [1, -1] as const) {
    const side = sign > 0 ? track.left : track.right;
    const kw = sign > 0 ? kerbs.left : kerbs.right;
    const geo = buildStrip(track, {
      from: (i) => (sign > 0 ? side.edge[i] + kw[i] : -concreteOffset(side, i) - 0.4),
      to: (i) => (sign > 0 ? concreteOffset(side, i) + 0.4 : -(side.edge[i] + kw[i])),
      segments: 4,
      lift: () => -0.004,
      colour: (i, _u, d, c) => {
        const surf = side.surface[i];
        const x = track.px[i] + track.lx[i] * d, z = track.pz[i] + track.lz[i] * d;
        const n = fbm(x / 9, z / 9, 3, 17);
        if (surf === 'grass') c.copy(VERGE_COLOURS.grass).lerp(VERGE_COLOURS.grassDry, 0.18 + Math.max(0, n) * 0.75);
        else if (surf === 'gravel') c.copy(VERGE_COLOURS.gravel).multiplyScalar(1 + n * 0.12);
        else if (surf === 'asphalt') c.copy(VERGE_COLOURS.asphalt).multiplyScalar(1 + n * 0.08);
        else c.copy(VERGE_COLOURS.concrete).multiplyScalar(0.95 + n * 0.05);
        // Tyre marks and dust in the first metre off the road.
        const off = Math.abs(d) - side.edge[i];
        if (off < 1.2) c.lerp(c2.copy(linearColour(GROUND.clay)), 0.12 * (1 - off / 1.2));
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

export function buildBarriers(track: Track, renderer: THREE.WebGLRenderer): THREE.Group {
  const g = new THREE.Group();
  g.name = 'barriers';
  const concreteMat = new THREE.MeshStandardMaterial({ color: TRACKSIDE.concrete, map: concreteTexture(renderer), roughness: 0.92 });
  const tyreMat = vertexColourMaterial({ roughness: 0.85, flat: true });
  const fenceTex = chainLinkTexture(renderer);
  const fenceMat = new THREE.MeshStandardMaterial({
    color: TRACKSIDE.fenceMesh, map: fenceTex, alphaMap: fenceTex, alphaTest: 0.35, transparent: false,
    side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4,
  });
  fenceMat.alphaToCoverage = true;
  // Far away the mipmapped wire alpha averages to ~0.12 and the alpha test would cut the
  // whole fence (only the posts stay). Fade from crisp wires to a light haze instead.
  fenceMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
      vec2 fenceTexel = vMapUv * 128.0;
      float fenceLod = log2(max(length(dFdx(fenceTexel)), length(dFdy(fenceTexel))) + 1e-6);
      float fenceCrisp = smoothstep(alphaTest, alphaTest + fwidth(diffuseColor.a), diffuseColor.a);
      float fenceHaze = clamp(diffuseColor.a * 1.8, 0.0, 0.55);
      diffuseColor.a = mix(fenceCrisp, fenceHaze, smoothstep(1.0, 2.5, fenceLod));
      if (diffuseColor.a < 0.01) discard;
    `);
  };
  const postGeo = new THREE.CylinderGeometry(0.035, 0.04, FENCE_HEIGHT + 0.3, 6).translate(0, (FENCE_HEIGHT + 0.3) / 2, 0);
  const postMat = new THREE.MeshStandardMaterial({ color: TRACKSIDE.fencePost, roughness: 0.45, metalness: 0.6, flatShading: true });
  const postMatrices: THREE.Matrix4[] = [];

  for (const sign of [1, -1] as const) {
    const side = sign > 0 ? track.left : track.right;
    const wall = new THREE.Mesh(wallGeometry(track, side, sign), concreteMat);
    wall.castShadow = true;
    wall.receiveShadow = true;
    g.add(wall);
    const tyres = tyreWallGeometry(track, side, sign);
    if (tyres) {
      const m = new THREE.Mesh(tyres, tyreMat);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const fence = fenceGeometry(track, side, sign);
    if (fence) g.add(new THREE.Mesh(fence, fenceMat));
    // Fence posts every 4 m on the back edge of the wall.
    const step = Math.max(1, Math.round(4 / track.spacing));
    for (let i = 0; i < track.n; i += step) {
      if (!side.fence[i]) continue;
      const d = sign * (concreteOffset(side, i) + 0.28);
      const y = heightAt(track, i, 0, d) + WALL_HEIGHT;
      postMatrices.push(new THREE.Matrix4().makeTranslation(track.px[i] + track.lx[i] * d, y - 0.3, track.pz[i] + track.lz[i] * d));
    }
  }
  const posts = new THREE.InstancedMesh(postGeo, postMat, postMatrices.length);
  postMatrices.forEach((m, k) => posts.setMatrixAt(k, m));
  posts.castShadow = true;
  posts.name = 'fence-posts';
  posts.computeBoundingSphere();
  g.add(posts);
  return g;
}

/** Concrete barrier: sloped toe, near-vertical face, flat top, back face. Metres. */
const WALL_PROFILE: Array<[number, number]> = [[-0.02, -0.25], [0, 0.08], [0.07, 0.3], [0.13, WALL_HEIGHT], [0.33, WALL_HEIGHT], [0.38, -0.25]];

function sweep(track: Track, sign: 1 | -1, include: (i: number) => boolean, base: (i: number) => number, profile: Array<[number, number]>, colour?: (i: number, k: number, c: THREE.Color) => void): THREE.BufferGeometry {
  // Each profile edge is one strip so that edges get hard normals (faceted look).
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < profile.length - 1; k++) {
    const [o0, h0] = profile[k], [o1, h1] = profile[k + 1];
    parts.push(
      buildStrip(track, {
        include,
        from: (i) => sign * (base(i) + (sign > 0 ? o1 : o0)),
        to: (i) => sign * (base(i) + (sign > 0 ? o0 : o1)),
        segments: 1,
        uvRepeat: 6,
        lift: (i, u) => {
          const t = sign > 0 ? 1 - u : u; // 0 at profile point k, 1 at k+1
          const dK = base(i) + o0, dK1 = base(i) + o1;
          const yGround = heightAt(track, i, 0, sign * (dK + (dK1 - dK) * t));
          const yWall = heightAt(track, i, 0, sign * base(i));
          return yWall + h0 + (h1 - h0) * t - yGround;
        },
        colour: colour ? (i, _u, _d, c) => colour(i, k, c) : undefined,
      }),
    );
    // UV: x = distance along the track / 6 m, y = height on the profile (0 at the base).
    const part = parts[parts.length - 1];
    const uv = part.getAttribute('uv') as THREE.BufferAttribute;
    const top = Math.max(...profile.map((p) => p[1]));
    for (let v = 0; v < uv.count; v++) {
      const u = v % 2;
      const t = sign > 0 ? 1 - u : u;
      uv.setXY(v, uv.getY(v), (h0 + (h1 - h0) * t + 0.25) / (top + 0.25));
    }
  }
  return mergeParts(parts);
}

function wallGeometry(track: Track, side: SideArrays, sign: 1 | -1): THREE.BufferGeometry {
  return sweep(track, sign, () => true, (i) => concreteOffset(side, i), WALL_PROFILE);
}

function tyreWallGeometry(track: Track, side: SideArrays, sign: 1 | -1): THREE.BufferGeometry | null {
  if (!side.barrier.some((b) => b === 'tyres')) return null;
  const black = linearColour(TRACKSIDE.tyre), belt = linearColour(TRACKSIDE.tyreBeltWhite), blue = linearColour(TRACKSIDE.tyreBeltBlue);
  const profile: Array<[number, number]> = [[0, -0.2], [0, 0.95], [0.08, 1.05], [TYRE_WALL_DEPTH, 1.05]];
  // Front face and its top bevel carry the coloured belt panels; the top is worn grey rubber
  // (an all-black top reads as a trench from the TV and high cameras).
  const top = linearColour(0x4b4d51);
  return sweep(track, sign, (i) => side.barrier[i] === 'tyres', (i) => side.wall[i], profile, (i, k, c) => {
    const panel = Math.floor((i * track.spacing) / 6) % 4;
    if (k <= 1) c.copy(panel === 0 ? belt : panel === 2 ? blue : black);
    else c.copy(top);
  });
}

function fenceGeometry(track: Track, side: SideArrays, sign: 1 | -1): THREE.BufferGeometry | null {
  if (!side.fence.some(Boolean)) return null;
  const parts: THREE.BufferGeometry[] = [];
  const d = (i: number) => sign * (concreteOffset(side, i) + 0.28);
  const geo = buildStrip(track, {
    include: (i) => side.fence[i] === 1,
    from: (i) => d(i) - 0.001,
    to: (i) => d(i) + 0.001,
    segments: 1,
    lift: (_i, u) => WALL_HEIGHT + (u > 0.5 ? FENCE_HEIGHT : 0),
  });
  // Vertical fence: UVs along s (0.5 m repeat) and height. Odd vertices are the top edge.
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getY(v) * 2, v % 2 === 1 ? FENCE_HEIGHT * 2 : 0);
  geo.computeVertexNormals();
  parts.push(geo);
  return mergeParts(parts);
}

function mergeParts(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIndexed = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let count = 0;
  for (const p of nonIndexed) count += p.getAttribute('position').count;
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color', 'uv'] as const) {
    const size = name === 'uv' ? 2 : 3;
    const arr = new Float32Array(count * size);
    let off = 0;
    for (const p of nonIndexed) {
      const a = p.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (a) arr.set(a.array as Float32Array, off);
      off += p.getAttribute('position').count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}
