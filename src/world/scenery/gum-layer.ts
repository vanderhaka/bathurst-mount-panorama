import { getGraphics, QUALITY } from '@/config/graphics';
import { createPropRegistry } from '@/props/registry';
import { runSync } from '@/world/cooperative';
import { createGumMaterialsSteps } from '@/props/trees/gum-materials';
import type { QualityPreset } from '@/render/renderer';

/** Each world owns one atlas, its shadow materials and a separate prop geometry cache. */
export function createGumLayer(quality: QualityPreset) {
  return runSync(createGumLayerSteps(quality));
}

/** The same layer, handing the thread back while the leaf and bark atlas is drawn. */
export function* createGumLayerSteps(quality: QualityPreset) {
  const tier = QUALITY[quality], cfg = getGraphics();
  const gums = yield* createGumMaterialsSteps({ atlasSize: tier.detailMapSize, barkDetail: cfg.treeBarkDetail && tier.treeBarkDetail });
  const registry = createPropRegistry(gums);
  let disposed = false;
  return { getPropAsset: registry.get, update(seconds: number) {
    if (!disposed) gums.update(seconds, tier.treeWind ? getGraphics().treeWind : 0);
  }, dispose() {
    if (disposed) return; disposed = true;
    registry.dispose(); gums.dispose();
  } };
}
