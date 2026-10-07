import * as THREE from 'three';
import type { GetPropAsset, InstancedPropKind, PropAsset, PropVariantCount } from '@/types/props';
import { getCachedAsset, onAssetCacheClear, setCachedAsset } from '@/props/core/cache';
import { foliageMaterial, propMaterial, tintMaterial } from '@/props/core/materials';
import { KIND_BUILDERS, type KindBuilder } from '@/props/kinds';
import { autoLod } from '@/props/core/auto-lod';
import { createGumMaterials } from '@/props/trees/gum-materials';

type GumMaterials = ReturnType<typeof createGumMaterials>;
let previewGums: GumMaterials | undefined;
const retiredPreviewGums: GumMaterials[] = [];
onAssetCacheClear(dispose => {
  if (previewGums) retiredPreviewGums.push(previewGums);
  previewGums = undefined;
  if (dispose) { for (const gums of retiredPreviewGums) gums.dispose(); retiredPreviewGums.length = 0; }
});

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

function variantKey(kind: InstancedPropKind, variant: number): { variant: number; key: string } {
  const builder = KIND_BUILDERS[kind];
  if (!builder) throw new Error(`Unknown prop kind: ${kind}`);
  const v = ((Math.floor(variant) % builder.variants) + builder.variants) % builder.variants;
  return { variant: v, key: `${kind}:${v}` };
}

function buildAsset(kind: InstancedPropKind, v: number, key: string, gums?: GumMaterials): PropAsset {
  const builder = KIND_BUILDERS[kind];
  const built = builder.build(v);
  // Small props without their own far version get a box stand-in (seen beyond the LOD distance).
  if (!built.lod && AUTO_LOD[kind] !== undefined) built.lod = autoLod(built.geometry, AUTO_LOD[kind]);
  built.geometry.computeBoundingBox();
  const bb = built.geometry.boundingBox ?? new THREE.Box3();
  // Footprint radius: the builder's hint, never smaller than the real horizontal extent.
  const extent = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
  const radius = Math.max(built.radius ?? 0, extent);
  const height = Math.max(built.height ?? 0, bb.max.y);
  const material = builder.gumSurface && gums ? gums.material : builder.material ? builder.material() : builder.tintable ? tintMaterial() : builder.foliage ? foliageMaterial() : propMaterial();
  built.geometry.name = key;
  if (built.lod) built.lod.name = `${key}:lod`;
  const asset: PropAsset = {
    geometry: built.geometry,
    material,
    customDepthMaterial: builder.gumSurface ? gums?.depthMaterial : undefined,
    customDistanceMaterial: builder.gumSurface ? gums?.distanceMaterial : undefined,
    lodGeometry: built.lod,
    lodDistanceScale: AUTO_LOD[kind] !== undefined && built.lod ? AUTO_LOD_DISTANCE : 1,
    tintable: builder.tintable,
    castShadow: builder.castShadow,
    radius,
    height,
    triangles: triangles(built.geometry),
  };
  return asset;
}

/** Standalone prop previews keep a small alpha atlas; worlds use their own registry below. */
export const getPropAsset: GetPropAsset = (kind, variant = 0) => {
  const { variant: v, key } = variantKey(kind, variant), hit = getCachedAsset(key);
  if (hit) return hit;
  if (KIND_BUILDERS[kind].gumSurface && !previewGums) previewGums = createGumMaterials({ atlasSize: 256, barkDetail: false });
  const asset = buildAsset(kind, v, key, previewGums);
  setCachedAsset(key, asset);
  return asset;
};

/** Geometry ownership is local to a world, so building its replacement cannot invalidate it. */
export function createPropRegistry(gums: GumMaterials) {
  const assets = new Map<string, PropAsset>();
  let disposed = false;
  const get: GetPropAsset = (kind, variant = 0) => {
    if (disposed) throw new Error('Prop registry has been disposed');
    const { variant: v, key } = variantKey(kind, variant);
    let asset = assets.get(key);
    if (!asset) { asset = buildAsset(kind, v, key, gums); assets.set(key, asset); }
    return asset;
  };
  return { get, dispose: () => {
    if (disposed) return; disposed = true;
    for (const asset of assets.values()) { asset.geometry.dispose(); asset.lodGeometry?.dispose(); }
    assets.clear();
  } };
}
