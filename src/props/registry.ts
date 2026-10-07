import * as THREE from 'three';
import type { GetPropAsset, InstancedPropKind, PropAsset, PropVariantCount } from '@/types/props';
import { getCachedAsset, setCachedAsset } from '@/props/core/cache';
import { foliageMaterial, propMaterial, tintMaterial } from '@/props/core/materials';
import { KIND_BUILDERS, type KindBuilder } from '@/props/kinds';
import { autoLod } from '@/props/core/auto-lod';

// getPropAsset: builds (once) and caches one geometry + one shared material per kind × variant.

/** Kinds that get an automatic far stand-in, with the box base height (fraction of the prop height). */
const AUTO_LOD: Partial<Record<InstancedPropKind, number>> = {
  tent: 0, caravan: 0, campervan: 0, roadCar: 0, gazebo: 0.75, spectator: 0, spectatorSeated: 0, portaloo: 0, waterTank: 0,
};

/** Box stand-ins switch in at this multiple of the tree LOD distance (about 350 m). */
const AUTO_LOD_DISTANCE = 2.2;

export const PROP_VARIANTS: PropVariantCount = Object.fromEntries(
  (Object.entries(KIND_BUILDERS) as Array<[InstancedPropKind, KindBuilder]>).map(([k, b]) => [k, b.variants]),
) as PropVariantCount;

function triangles(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}

export const getPropAsset: GetPropAsset = (kind, variant = 0) => {
  const builder = KIND_BUILDERS[kind];
  if (!builder) throw new Error(`Unknown prop kind: ${kind}`);
  const v = ((Math.floor(variant) % builder.variants) + builder.variants) % builder.variants;
  const key = `${kind}:${v}`;
  const hit = getCachedAsset(key);
  if (hit) return hit;
  const built = builder.build(v);
  // Small props without their own far version get a box stand-in (seen beyond the LOD distance).
  if (!built.lod && AUTO_LOD[kind] !== undefined) built.lod = autoLod(built.geometry, AUTO_LOD[kind]);
  built.geometry.computeBoundingBox();
  const bb = built.geometry.boundingBox ?? new THREE.Box3();
  // Footprint radius: the builder's hint, never smaller than the real horizontal extent.
  const extent = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
  const radius = Math.max(built.radius ?? 0, extent);
  const height = Math.max(built.height ?? 0, bb.max.y);
  const material = builder.material ? builder.material() : builder.tintable ? tintMaterial() : builder.foliage ? foliageMaterial() : propMaterial();
  built.geometry.name = key;
  if (built.lod) built.lod.name = `${key}:lod`;
  const asset: PropAsset = {
    geometry: built.geometry,
    material,
    lodGeometry: built.lod,
    lodDistanceScale: AUTO_LOD[kind] !== undefined && built.lod ? AUTO_LOD_DISTANCE : 1,
    tintable: builder.tintable,
    castShadow: builder.castShadow,
    radius,
    height,
    triangles: triangles(built.geometry),
  };
  setCachedAsset(key, asset);
  return asset;
};
