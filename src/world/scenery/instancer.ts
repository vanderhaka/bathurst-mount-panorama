import * as THREE from 'three';
import { getPropAsset } from '@/props';
import type { GetPropAsset, InstancedPropKind, PropAsset } from '@/types/props';
import { ContactAo } from '@/art/ambient-occlusion';
import { gumLodWeights } from '@/props/trees/gum-lod';
import { padGumBounds } from '@/props/trees/gum-wind';

interface Placement {
  asset: PropAsset;
  x: number; y: number; z: number; yaw: number; scale: number;
  colour?: THREE.Color;
  /** Optional surface normal the prop's up axis is tilted to. */
  up?: THREE.Vector3;
}

interface Batch {
  mesh: THREE.BatchedMesh;
  /** Per instance: near and far geometry ids (far = -1 when none), position. */
  near: Int32Array;
  far: Int32Array;
  pos: Float32Array;
  usingFar: Uint8Array;
  dual: Int32Array;
  colours: Float32Array;
  blend: Float32Array;
  /** Per instance: squared multiplier of the LOD switch distance. */
  lodScale2: Float32Array;
  hidden: Uint8Array;
  cursor: number;
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * Keeps the shared vertex schema, including leaf/bark UVs and wind for gum batches.
 */
function normalise(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const attributes = g.getAttribute('treeSurface') ? ['position', 'normal', 'color', 'tintMask', 'uv', 'treeSurface', 'treeWind'] : ['position', 'normal', 'color', 'tintMask'];
  for (const name of Object.keys(g.attributes)) if (!attributes.includes(name)) g.deleteAttribute(name);
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
  padGumBounds(g);
  return g;
}

/**
 * Collects prop placements and builds one BatchedMesh per shared material: a
 * handful of draw calls for tens of thousands of props, with per-instance
 * frustum culling and distance LOD (near/far geometry swap).
 */
export class PropInstancer {
  readonly group = new THREE.Group();
  readonly contactAo = new ContactAo();
  private placements: Placement[] = [];
  private batches: Batch[] = [];

  constructor(private readonly assets: GetPropAsset = getPropAsset) {
    this.group.name = 'props';
  }

  add(kind: InstancedPropKind, variant: number, x: number, y: number, z: number, yaw = 0, scale = 1, colour?: number | THREE.Color, up?: THREE.Vector3): PropAsset {
    const asset = this.assets(kind, variant);
    // Existing gums already contribute the canopy footprint; bark/low bush need no 4 m AO discs.
    if (kind !== 'gumShrub' && kind !== 'fallenBark') this.contactAo.add(x, z, asset.radius * scale);
    this.placements.push({ asset, x, y, z, yaw, scale, colour: colour === undefined ? undefined : colour instanceof THREE.Color ? colour : new THREE.Color(colour), up: up?.clone() });
    return asset;
  }

  build(): { instances: number; batches: number } {
    const byMaterial = new Map<THREE.Material, Placement[]>();
    for (const p of this.placements) {
      const list = byMaterial.get(p.asset.material);
      if (list) list.push(p);
      else byMaterial.set(p.asset.material, [p]);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), t = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), tilt = new THREE.Quaternion();
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
      const pairs = list.filter(p => p.asset.lodGeometry && p.asset.geometry.getAttribute('treeSurface')).length;
      const mesh = new THREE.BatchedMesh(list.length + pairs, verts, 0, material);
      mesh.sortObjects = false;
      mesh.perObjectFrustumCulled = true;
      for (const [orig, n] of normalised) { geoIds.set(orig, mesh.addGeometry(n)); n.dispose(); }
      mesh.customDepthMaterial = list[0].asset.customDepthMaterial;
      mesh.customDistanceMaterial = list[0].asset.customDistanceMaterial;
      const b: Batch = {
        mesh,
        near: new Int32Array(list.length), far: new Int32Array(list.length),
        pos: new Float32Array(list.length * 3), usingFar: new Uint8Array(list.length), hidden: new Uint8Array(list.length), cursor: 0,
        dual: new Int32Array(list.length).fill(-1), colours: new Float32Array(list.length * 3), blend: new Float32Array(list.length).fill(-1),
        lodScale2: Float32Array.from(list, (p) => (p.asset.lodDistanceScale ?? 1) ** 2),
      };
      list.forEach((p, k) => {
        const id = mesh.addInstance(geoIds.get(p.asset.geometry)!);
        b.near[k] = geoIds.get(p.asset.geometry)!;
        b.far[k] = p.asset.lodGeometry ? geoIds.get(p.asset.lodGeometry)! : -1;
        b.pos.set([p.x, p.y, p.z], k * 3);
        q.setFromAxisAngle(up, p.yaw);
        if (p.up) q.premultiply(tilt.setFromUnitVectors(up, p.up));
        m.compose(t.set(p.x, p.y, p.z), q, s.setScalar(p.scale));
        mesh.setMatrixAt(id, m);
        const colour = p.colour ?? WHITE;
        mesh.setColorAt(id, colour); b.colours.set([colour.r, colour.g, colour.b], k * 3);
      });
      list.forEach((p, k) => {
        if (!p.asset.lodGeometry || !p.asset.geometry.getAttribute('treeSurface')) return;
        const id = mesh.addInstance(b.far[k]); b.dual[k] = id;
        mesh.getMatrixAt(k, m); mesh.setMatrixAt(id, m);
        const colour = p.colour ?? WHITE; mesh.setColorAt(id, new THREE.Vector4(colour.r, colour.g, colour.b, -1));
        mesh.setVisibleAt(id, false);
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
    const colour = new THREE.Vector4();
    for (const b of this.batches) {
      const n = b.near.length;
      const count = Math.min(n, budget);
      for (let k = 0; k < count; k++) {
        const i = (b.cursor + k) % n;
        const dx = b.pos[i * 3] - camera.x, dz = b.pos[i * 3 + 2] - camera.z;
        const d2 = dx * dx + dz * dz;
        const hide = d2 > draw2 ? 1 : 0;
        if (b.dual[i] >= 0) {
          const fade = gumLodWeights(Math.sqrt(d2), lodDistance * Math.sqrt(b.lodScale2[i])).far;
          if (hide !== b.hidden[i] || Math.abs(fade - b.blend[i]) > 0.001 || ((fade === 0 || fade === 1) && fade !== b.blend[i])) {
            b.hidden[i] = hide; b.blend[i] = fade;
            b.mesh.setVisibleAt(i, !hide && fade < 1); b.mesh.setVisibleAt(b.dual[i], !hide && fade > 0);
            colour.set(b.colours[i * 3], b.colours[i * 3 + 1], b.colours[i * 3 + 2], 1 - fade);
            b.mesh.setColorAt(i, colour); colour.w = -fade; b.mesh.setColorAt(b.dual[i], colour);
          }
          continue;
        }
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

  /** BatchedMesh owns additional matrix/colour/indirect textures, beyond its geometry. */
  dispose(): void {
    for (const batch of this.batches) batch.mesh.dispose();
    this.group.clear(); this.batches = []; this.placements = [];
  }
}
