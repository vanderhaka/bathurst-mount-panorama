import { getGraphics, QUALITY } from '@/config/graphics';
import { createPropRegistry } from '@/props/registry';
import { createGumMaterials } from '@/props/trees/gum-materials';
import type { QualityPreset } from '@/render/renderer';

/** Each world owns one atlas, its shadow materials and a separate prop geometry cache. */
export function createGumLayer(quality: QualityPreset) {
  const tier = QUALITY[quality], cfg = getGraphics();
  const gums = createGumMaterials({ atlasSize: tier.detailMapSize, barkDetail: cfg.treeBarkDetail && tier.treeBarkDetail });
  const registry = createPropRegistry(gums);
  let disposed = false;
  return { getPropAsset: registry.get, update(seconds: number) {
    if (!disposed) gums.update(seconds, tier.treeWind ? getGraphics().treeWind : 0);
  }, dispose() {
    if (disposed) return; disposed = true;
    registry.dispose(); gums.dispose();
  } };
}
