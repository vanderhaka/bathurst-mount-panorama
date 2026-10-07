import * as THREE from 'three';
import { getPropAsset } from '@/props';
import type { InstancedPropKind, PropAsset } from '@/types/props';

interface Placement {
  asset: PropAsset;
  x: number; y: number; z: number; yaw: number; scale: number;
  colour?: THREE.Color;
}

interface Batch {
  mesh: THREE.BatchedMesh;
  /** Per instance: near and far geometry ids (far = -1 when none), position. */
  near: Int32Array;
  far: Int32Array;
  pos: Float32Array;
  usingFar: Uint8Array;
  /** Per instance: squared multiplier of the LOD switch distance. */
  lodScale2: Float32Array;
  hidden: Uint8Array;
  cursor: number;
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * Keeps only position/normal/color (and tintMask, which limits the instance tint to
 * the tintable parts) as non-indexed so that all geometries fit one BatchedMesh.
 */
function normalise(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'tintMask'].includes(name)) g.deleteAttribute(name);
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  if (!g.getAttribute('color')) {
    const c = new Float32Array(g.getAttribute('position').count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  const col = g.getAttribute('color');
  if (col.itemSize !== 3) {
    const c = new Float32Array(col.count * 3);
    for (let i = 0; i < col.count; i++) { c[i * 3] = col.getX(i); c[i * 3 + 1] = col.getY(i); c[i * 3 + 2] = col.getZ(i); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g = g.index ? g.toNonIndexed() : g;
  return g;
}

/**
 * Collects prop placements and builds one BatchedMesh per shared material: a
 * handful of draw calls for tens of thousands of props, with per-instance
 * frustum culling and distance LOD (near/far geometry swap).
 */
export class PropInstancer {
  readonly group = new THREE.Group();
  private placements: Placement[] = [];
  private batches: Batch[] = [];

  constructor() {
    this.group.name = 'props';
  }

  add(kind: InstancedPropKind, variant: number, x: number, y: number, z: number, yaw = 0, scale = 1, colour?: number | THREE.Color): void {
    const asset = getPropAsset(kind, variant);
    this.placements.push({ asset, x, y, z, yaw, scale, colour: colour === undefined ? undefined : colour instanceof THREE.Color ? colour : new THREE.Color(colour) });
  }

  build(): { instances: number; batches: number } {
    const byMaterial = new Map<THREE.Material, Placement[]>();
    for (const p of this.placements) {
      const list = byMaterial.get(p.asset.material);
      if (list) list.push(p);
      else byMaterial.set(p.asset.material, [p]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (const [material, list] of byMaterial) {
      const geoIds = new Map<THREE.BufferGeometry, number>();
      const normalised = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
      let verts = 0;
      const need = (g?: THREE.BufferGeometry) => {
        if (!g || normalised.has(g)) return;
        const n = normalise(g);
        normalised.set(g, n);
        verts += n.getAttribute('position').count;
      };
      for (const p of list) { need(p.asset.geometry); need(p.asset.lodGeometry); }
      // All geometries of one batch need the same attributes: where some carry a tint
      // mask, the others get a full one (tinted all over, as before).
      if ([...normalised.values()].some((n) => n.getAttribute('tintMask'))) {
        for (const n of normalised.values()) {
          if (!n.getAttribute('tintMask')) n.setAttribute('tintMask', new THREE.BufferAttribute(new Float32Array(n.getAttribute('position').count).fill(1), 1));
        }
      } else for (const n of normalised.values()) n.deleteAttribute('tintMask');
      const mesh = new THREE.BatchedMesh(list.length, verts, 0, material);
      mesh.sortObjects = false;
      mesh.perObjectFrustumCulled = true;
      for (const [orig, n] of normalised) geoIds.set(orig, mesh.addGeometry(n));
      const b: Batch = {
        mesh,
        near: new Int32Array(list.length), far: new Int32Array(list.length),
        pos: new Float32Array(list.length * 3), usingFar: new Uint8Array(list.length), hidden: new Uint8Array(list.length), cursor: 0,
        lodScale2: Float32Array.from(list, (p) => (p.asset.lodDistanceScale ?? 1) ** 2),
      };
      list.forEach((p, k) => {
        const id = mesh.addInstance(geoIds.get(p.asset.geometry)!);
        b.near[k] = geoIds.get(p.asset.geometry)!;
        b.far[k] = p.asset.lodGeometry ? geoIds.get(p.asset.lodGeometry)! : -1;
        b.pos.set([p.x, p.y, p.z], k * 3);
        m.compose(t.set(p.x, p.y, p.z), q.setFromAxisAngle(up, p.yaw), s.setScalar(p.scale));
        mesh.setMatrixAt(id, m);
        mesh.setColorAt(id, p.colour ?? WHITE);
      });
      mesh.castShadow = list.some((p) => p.asset.castShadow);
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = `props-batch-${this.batches.length}`;
      this.group.add(mesh);
      this.batches.push(b);
    }
    const instances = this.placements.length;
    this.placements = [];
    return { instances, batches: this.batches.length };
  }

  /** Amortised LOD and draw-distance update: up to `budget` instances per batch per call. */
  update(camera: THREE.Vector3, lodDistance: number, drawDistance: number, budget = 3000): void {
    const lod2 = lodDistance * lodDistance, draw2 = drawDistance * drawDistance;
    for (const b of this.batches) {
      const n = b.near.length;
      const count = Math.min(n, budget);
      for (let k = 0; k < count; k++) {
        const i = (b.cursor + k) % n;
        const dx = b.pos[i * 3] - camera.x, dz = b.pos[i * 3 + 2] - camera.z;
        const d2 = dx * dx + dz * dz;
        const hide = d2 > draw2 ? 1 : 0;
        if (hide !== b.hidden[i]) { b.hidden[i] = hide; b.mesh.setVisibleAt(i, !hide); }
        if (b.far[i] >= 0) {
          const far = d2 > lod2 * b.lodScale2[i] ? 1 : 0;
          if (far !== b.usingFar[i]) { b.usingFar[i] = far; b.mesh.setGeometryIdAt(i, far ? b.far[i] : b.near[i]); }
        }
      }
      b.cursor = (b.cursor + count) % n;
    }
  }

  /** Full pass over every instance (after build and after teleports). */
  updateAll(camera: THREE.Vector3, lodDistance: number, drawDistance: number): void {
    this.update(camera, lodDistance, drawDistance, Number.MAX_SAFE_INTEGER);
  }
}
