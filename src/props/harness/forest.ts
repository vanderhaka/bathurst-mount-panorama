import * as THREE from 'three';
import { GROUND } from '@/art/palette';
import type { HarnessScene } from '@/harness/harness-scene';
import type { InstancedPropKind } from '@/types/props';
import { createRng } from '@/props/core/rng';
import { PROPS_LOOK } from '@/props/look';
import { getPropAsset, PROP_VARIANTS } from '@/props/registry';

// Forest test stand: 400 mixed trees on rolling ground, drawn with InstancedMesh,
// near/far LOD chosen per instance from the camera distance.

const SIZE = 200;
/** Hue multipliers the world applies to trees (neutral, blue-grey, warm olive, deep green). */
const WORLD_HUES: Array<[number, number, number]> = [[1, 1, 1], [0.86, 0.94, 1], [1, 0.95, 0.76], [0.84, 0.95, 0.8]];

export function groundHeight(x: number, z: number): number {
  return 3.2 * Math.sin(x * 0.019 + 0.6) * Math.cos(z * 0.016 - 0.3) + 1.4 * Math.sin(x * 0.047 + z * 0.038) + 0.5 * Math.cos(x * 0.11 - z * 0.09) + 3.5;
}

function buildGround(): THREE.Mesh {
  const g = new THREE.PlaneGeometry(SIZE + 120, SIZE + 120, 110, 110).rotateX(-Math.PI / 2).toNonIndexed();
  const pos = g.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  const grass = new THREE.Color().setHex(GROUND.grass);
  const light = new THREE.Color().setHex(GROUND.grassLight);
  const dry = new THREE.Color().setHex(GROUND.grassDry);
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  for (let f = 0; f < pos.count; f += 3) {
    const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const z = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const n = Math.sin(x * 0.07) * Math.cos(z * 0.06) + 0.5 * Math.sin(x * 0.21 + z * 0.17);
    const c = grass.clone().lerp(n > 0.4 ? dry : light, Math.min(1, Math.abs(n) * 0.6)).multiplyScalar(0.95 + ((f * 7919) % 97) / 970);
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  m.receiveShadow = true;
  return m;
}

interface Bucket {
  kind: InstancedPropKind;
  variant: number;
  matrices: THREE.Matrix4[];
  colours: THREE.Color[];
  near: THREE.InstancedMesh;
  far: THREE.InstancedMesh | null;
}

function scatter(): Array<{ kind: InstancedPropKind; x: number; z: number }> {
  const rng = createRng(42);
  const out: Array<{ kind: InstancedPropKind; x: number; z: number }> = [];
  let guard = 0;
  while (out.length < 400 && guard++ < 20000) {
    const x = rng.range(-SIZE / 2, SIZE / 2);
    const z = rng.range(-SIZE / 2, SIZE / 2);
    const density = 0.55 + 0.45 * Math.sin(x * 0.045 + 1) * Math.cos(z * 0.05);
    if (rng() > density) continue;
    if (Math.hypot(x, z) < 22) continue; // clearing in the middle for the camera target
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 36)) continue;
    const pineZone = x > 45 && z < -30;
    const kind: InstancedPropKind = pineZone ? 'pine' : rng() < 0.8 ? 'eucalyptus' : 'eucalyptusYoung';
    out.push({ kind, x, z });
  }
  return out;
}

export function buildForest(h: HarnessScene, lodMode: 'near' | 'far' | 'auto') {
  h.scene.traverse((o) => {
    if (o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry) o.visible = false;
  });
  h.scene.add(buildGround());
  const rng = createRng(7);
  const buckets = new Map<string, Bucket>();
  const spots = scatter();
  for (const s of spots) {
    const variant = rng.int(0, PROP_VARIANTS[s.kind] - 1);
    const key = `${s.kind}:${variant}`;
    let b = buckets.get(key);
    if (!b) {
      const a = getPropAsset(s.kind, variant);
      b = { kind: s.kind, variant, matrices: [], colours: [], near: new THREE.InstancedMesh(a.geometry, a.material, 400), far: a.lodGeometry ? new THREE.InstancedMesh(a.lodGeometry, a.material, 400) : null };
      for (const m of [b.near, b.far]) {
        if (!m) continue;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        h.scene.add(m);
      }
      buckets.set(key, b);
    }
    const scale = rng.range(0.85, 1.15);
    const y = groundHeight(s.x, s.z) - 0.15;
    b.matrices.push(new THREE.Matrix4().compose(new THREE.Vector3(s.x, y, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2), new THREE.Vector3(scale, scale * rng.range(0.92, 1.08), scale)));
    // Same per-tree tint as the world (src/world/scenery/vegetation.ts): brightness × hue multiplier.
    const hue = WORLD_HUES[rng.int(0, WORLD_HUES.length - 1)];
    const v = 0.82 + rng() * 0.18;
    b.colours.push(new THREE.Color(Math.min(1, v * hue[0]), Math.min(1, v * hue[1]), Math.min(1, v * hue[2])));
  }

  const tmp = new THREE.Vector3();
  const stats = { trees: spots.length, nearTrees: 0, farTrees: 0, treeTriangles: 0, lodSwitch: PROPS_LOOK.lod.treeSwitch };
  const rebucket = () => {
    stats.nearTrees = 0;
    stats.farTrees = 0;
    stats.treeTriangles = 0;
    for (const b of buckets.values()) {
      let n = 0;
      let f = 0;
      b.matrices.forEach((m, i) => {
        tmp.setFromMatrixPosition(m);
        const useFar = b.far && (lodMode === 'far' || (lodMode === 'auto' && tmp.distanceTo(h.camera.position) > PROPS_LOOK.lod.treeSwitch));
        const target = useFar ? b.far! : b.near;
        const idx = useFar ? f++ : n++;
        target.setMatrixAt(idx, m);
        target.setColorAt(idx, b.colours[i]);
      });
      b.near.count = n;
      if (b.far) b.far.count = f;
      for (const m of [b.near, b.far]) {
        if (!m) continue;
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
      stats.nearTrees += n;
      stats.farTrees += f;
      stats.treeTriangles += n * (b.near.geometry.getAttribute('position').count / 3) + f * (b.far ? b.far.geometry.getAttribute('position').count / 3 : 0);
    }
  };
  let last = new THREE.Vector3(Infinity, 0, 0);
  h.onFrame(() => {
    if (last.distanceTo(h.camera.position) > 2) {
      last = h.camera.position.clone();
      rebucket();
    }
  });
  const target = new THREE.Vector3(0, groundHeight(0, 0) + 4, 0);
  return { target, stats };
}
