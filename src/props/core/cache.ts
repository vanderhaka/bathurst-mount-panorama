import type { PropAsset } from '@/types/props';

// Asset cache shared by getPropAsset. Lives in its own module so that look.ts
// (which clears it) and the registry (which fills it) do not import each other.

const assets = new Map<string, PropAsset>();

export function getCachedAsset(key: string): PropAsset | undefined {
  return assets.get(key);
}

export function setCachedAsset(key: string, asset: PropAsset): void {
  assets.set(key, asset);
}

export function clearAssetCache(dispose: boolean): void {
  if (dispose) {
    for (const a of assets.values()) {
      a.geometry.dispose();
      a.lodGeometry?.dispose();
    }
  }
  assets.clear();
}
