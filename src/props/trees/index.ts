import { buildGum, type GumResult, type GumStyle } from '@/props/trees/gum';
import { buildPine, type PineResult } from '@/props/trees/pine';
import { PROPS_LOOK } from '@/props/look';

// Variant tables for the trees. Each row is one hand-tuned silhouette.

// Half smooth gums (pale trunks), half box gums (rough grey-brown trunks, denser
// darker crowns). Variants 0-3 are the common living trees (the world places only
// 0-3 in tree rows and far paddocks); 4-7 add a leaning gum with a dead branch, a
// twin-stemmed box, a dying stag and a small compact box.
const MATURE: GumStyle[] = [
  // 0 Smooth paddock red gum: low fork, broad crown much wider than tall, two limbs showing under it.
  { size: 0.7, fork: 0.27, lean: 0.03, leanDir: 2.1, limbs: 4, stems: 1, hue: 1.3, bark: 'smooth', strips: 0.6, crownW: 0.46, crownBase: 0.4, asym: 0.1, clusters: 9, showLimbs: 2 },
  // 1 Smooth forest gum: taller, narrower, crown taller than wide.
  { size: 1.0, fork: 0.38, lean: 0.02, leanDir: 0.6, limbs: 3, stems: 1, hue: 0.6, bark: 'smooth', strips: 0.3, crownW: 0.23, crownBase: 0.4, asym: 0.05, clusters: 9, showLimbs: 1 },
  // 2 Yellow box: rough grey-brown trunk, dense round dark crown.
  { size: 0.45, fork: 0.3, lean: 0.04, leanDir: 4.2, limbs: 3, stems: 1, hue: 2.6, bark: 'box', strips: 0, crownW: 0.4, crownBase: 0.33, asym: 0.15, clusters: 9, showLimbs: 0 },
  // 3 Broad grey box in a paddock: rough trunk, wide rounded crown.
  { size: 0.6, fork: 0.28, lean: 0.03, leanDir: 3.0, limbs: 4, stems: 1, hue: 1.8, bark: 'box', strips: 0, crownW: 0.48, crownBase: 0.34, asym: 0.1, clusters: 9, showLimbs: 1 },
  // 4 Leaning smooth gum, lopsided crown, a bare dead branch over the top.
  { size: 0.55, fork: 0.33, lean: 0.14, leanDir: 5.5, limbs: 3, stems: 1, hue: 0.2, bark: 'smooth', strips: 0.5, crownW: 0.36, crownBase: 0.38, asym: 0.45, clusters: 8, showLimbs: 1, dead: 'limb' },
  // 5 Twin-stemmed box gum, taller crown.
  { size: 0.8, fork: 0.34, lean: 0.03, leanDir: 0.0, limbs: 4, stems: 2, hue: 3.2, bark: 'box', strips: 0, crownW: 0.32, crownBase: 0.36, asym: 0.1, clusters: 9, showLimbs: 0 },
  // 6 Dying old smooth gum (stag): dead silver limbs over a low live crown.
  { size: 0.75, fork: 0.32, lean: 0.05, leanDir: 1.7, limbs: 4, stems: 1, hue: 1.0, bark: 'smooth', strips: 0.4, crownW: 0.36, crownBase: 0.4, asym: 0.2, clusters: 6, showLimbs: 0, dead: 'stag' },
  // 7 Smaller box, compact dense crown low on the trunk.
  { size: 0.15, fork: 0.26, lean: 0.06, leanDir: 2.6, limbs: 3, stems: 1, hue: 3.6, bark: 'box', strips: 0, crownW: 0.42, crownBase: 0.3, asym: 0.2, clusters: 8, showLimbs: 0 },
];

const YOUNG: GumStyle[] = [
  // 0 Smooth sapling with blue-grey juvenile leaves.
  { size: 0.3, fork: 0.28, lean: 0.05, leanDir: 0.5, limbs: 3, stems: 1, hue: 0.2, bark: 'smooth', strips: 0, crownW: 0.38, crownBase: 0.3, asym: 0.1, clusters: 6, showLimbs: 0 },
  // 1 Young box gum, round crown.
  { size: 0.75, fork: 0.3, lean: 0.03, leanDir: 2.0, limbs: 2, stems: 1, hue: 2.4, bark: 'box', strips: 0, crownW: 0.4, crownBase: 0.3, asym: 0.1, clusters: 7, showLimbs: 0 },
  // 2 Mallee-like clump of three smooth stems.
  { size: 0.25, fork: 0.3, lean: 0.08, leanDir: 4.0, limbs: 3, stems: 3, hue: 1.4, bark: 'smooth', strips: 0, crownW: 0.42, crownBase: 0.3, asym: 0.2, clusters: 6, showLimbs: 1 },
  // 3 Leaning young box.
  { size: 0.85, fork: 0.3, lean: 0.12, leanDir: 5.2, limbs: 2, stems: 1, hue: 3.0, bark: 'box', strips: 0, crownW: 0.36, crownBase: 0.3, asym: 0.4, clusters: 6, showLimbs: 0 },
  // 4 Small smooth sapling.
  { size: 0.0, fork: 0.25, lean: 0.04, leanDir: 1.5, limbs: 2, stems: 1, hue: 0.6, bark: 'smooth', strips: 0, crownW: 0.4, crownBase: 0.28, asym: 0.15, clusters: 5, showLimbs: 0 },
  // 5 Tall slender young forest gum.
  { size: 1.0, fork: 0.36, lean: 0.06, leanDir: 3.3, limbs: 3, stems: 1, hue: 1.0, bark: 'smooth', strips: 0.2, crownW: 0.25, crownBase: 0.36, asym: 0.1, clusters: 7, showLimbs: 0 },
];

export const TREE_VARIANTS = { eucalyptus: MATURE.length, eucalyptusYoung: YOUNG.length, pine: 5 } as const;

export function buildEucalyptus(variant: number): GumResult {
  return buildGum(PROPS_LOOK.eucalyptus, MATURE[variant % MATURE.length], 1000 + variant * 977);
}

export function buildYoungEucalyptus(variant: number): GumResult {
  return buildGum(PROPS_LOOK.eucalyptusYoung, YOUNG[variant % YOUNG.length], 5000 + variant * 613);
}

export function buildPineTree(variant: number): PineResult {
  return buildPine(variant % TREE_VARIANTS.pine);
}
