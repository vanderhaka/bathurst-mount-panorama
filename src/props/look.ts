// Visual tunables for the props library, in one typed object.
// Builders read colours and shape ranges from here (or straight from
// src/art/palette.ts), never from hex literals of their own. A live tuning panel
// calls setPropsLook({...}) and then rebuilds; cached assets are dropped.
import { BUILDING, FOLIAGE, GROUND, LIVERY_COLOURS, TRACKSIDE } from '@/art/palette';
import { clearAssetCache } from '@/props/core/cache';

export type Range = [min: number, max: number];

export interface TreeLook {
  /** Overall height range (m). Variants spread evenly across it. */
  height: Range;
  /** Crown foliage colours (sRGB), a blue-grey → olive gradient. Each variant picks a blend of neighbours. */
  foliage: number[];
  /** Per-tree colour jitter (0..1): how far a variant drifts from its base foliage colour. */
  foliageJitter: number;
  /** Per-face brightness jitter inside a crown (0..1). */
  faceJitter: number;
  /** Underside darkening of the crown (0..1), a cheap self-shadow. */
  underShade: number;
  /** Undersides blend towards this cool grey-green by `underBlend` (offsets the warm ground bounce). */
  under: number;
  underBlend: number;
  /** Darkening of faces deep inside the crown mass (0..1). */
  innerShade: number;
  /** Top-face blend towards `sheen` (0..1), the silvery shine of gum leaves. */
  topSheen: number;
  sheen: number;
  /** Smooth gums: pale bark, darker mottling, hanging bark ribbons. Box gums: rough fibrous bark. */
  trunk: number;
  bark: number;
  barkStrip: number;
  boxBark: number;
  deadWood: number;
  /** Share of smooth-bark faces that show mottled patches (0..1). */
  barkPatchiness: number;
  /** Box-gum crowns are this much darker than smooth gums (multiplier ≤ 1). */
  boxCrownShade: number;
  /** Lumpy clusters packed into one crown mass. */
  clusters: Range;
  /** Cluster radius as a fraction of the crown radius (bigger = denser, rounder crown). */
  clusterSize: Range;
  /** How far clusters sit out from the crown centre, as a fraction of its radius (ragged edge). */
  clusterReach: Range;
}

export interface PropsLook {
  shading: {
    /** Flat (faceted) shading. False gives smooth vertex-normal shading. */
    flat: boolean;
    roughness: number;
    foliageRoughness: number;
    metalRoughness: number;
    glassRoughness: number;
    /**
     * Gum trees: how much of the per-instance colour's hue reaches the leaves (0 = brightness
     * only, 1 = full tint). Trunks always take brightness only, so they stay white-grey.
     */
    treeTintHue: number;
  };
  eucalyptus: TreeLook;
  eucalyptusYoung: TreeLook;
  pine: { height: Range; foliage: number; foliageDark: number; trunk: number; tiers: Range; faceJitter: number };
  shrub: { colours: number[]; faceJitter: number };
  grass: { colours: number[] };
  rock: { colours: number[]; lichen: number };
  /** Distance hints (m) for the world builder: where to swap to lodGeometry, and where to stop drawing. */
  lod: { treeSwitch: number; treeHide: number; spectatorSwitch: number; spectatorHide: number; smallPropHide: number };
  people: {
    /** Instance-colour suggestions for shirts (spectator tint). */
    shirts: number[];
    pants: number[];
    skin: number[];
    hair: number[];
    hats: number[];
  };
  /** Colours for crowds merged into grandstands and for camping-gear tint suggestions. */
  /** `teams`: the main colour of each grandstand seat block (fans sit together). */
  crowd: { shirts: number[]; teams: number[]; teamShare: number; jitter: number };
  /** Grandstand front sponsor panels (plain colours, no text) and the roof fascia band colour. */
  grandstand: { fascia: number[]; roofBand: number };
  /** Pit building signage band panels along the pit-lane face (plain colour panels / stripes). */
  pitBuilding: { signage: number[]; signageStripe: number[] };
  camping: { tentFly: number[]; gazebo: number[]; groundsheet: number; chairs: number[]; esky: number; awningStripe: number; annexMat: number };
  vehicles: { paint: number[]; tyre: number; trim: number; glass: number; chrome: number; tailLight: number; headLight: number };
  buildings: { roofs: number[]; walls: number[]; weatherboard: number[] };
}

/** Default look. Colours come from the shared palette; a few prop-only colours (skin, denim, hair) live here. */
function defaultLook(): PropsLook {
  return {
    shading: { flat: true, roughness: 0.9, foliageRoughness: 0.95, metalRoughness: 0.55, glassRoughness: 0.28, treeTintHue: 0.5 },
    eucalyptus: {
      height: [12, 25],
      foliage: [FOLIAGE.eucalyptBlueGrey, FOLIAGE.eucalyptGreyGreen, FOLIAGE.eucalyptSage, FOLIAGE.eucalyptOlive, FOLIAGE.eucalyptDarkOlive],
      foliageJitter: 0.3,
      faceJitter: 0.07,
      underShade: 0.22,
      under: FOLIAGE.eucalyptBlueGrey,
      underBlend: 0.35,
      innerShade: 0.25,
      topSheen: 0.22,
      sheen: FOLIAGE.eucalyptSheen,
      trunk: FOLIAGE.eucalyptTrunkPale,
      bark: FOLIAGE.eucalyptBark,
      barkStrip: FOLIAGE.eucalyptBarkStrip,
      boxBark: FOLIAGE.eucalyptBoxBark,
      deadWood: FOLIAGE.eucalyptDeadWood,
      barkPatchiness: 0.3,
      boxCrownShade: 0.86,
      clusters: [5, 9],
      clusterSize: [0.42, 0.58],
      clusterReach: [0.5, 0.66],
    },
    eucalyptusYoung: {
      height: [4, 8],
      foliage: [FOLIAGE.eucalyptBlueGrey, FOLIAGE.eucalyptGreyGreen, FOLIAGE.eucalyptSage, FOLIAGE.eucalyptOlive],
      foliageJitter: 0.28,
      faceJitter: 0.06,
      underShade: 0.2,
      under: FOLIAGE.eucalyptBlueGrey,
      underBlend: 0.35,
      innerShade: 0.2,
      topSheen: 0.22,
      sheen: FOLIAGE.eucalyptSheen,
      trunk: FOLIAGE.eucalyptTrunkPale,
      bark: FOLIAGE.eucalyptBark,
      barkStrip: FOLIAGE.eucalyptBarkStrip,
      boxBark: FOLIAGE.eucalyptBoxBark,
      deadWood: FOLIAGE.eucalyptDeadWood,
      barkPatchiness: 0.2,
      boxCrownShade: 0.88,
      clusters: [4, 7],
      clusterSize: [0.45, 0.6],
      clusterReach: [0.48, 0.62],
    },
    pine: { height: [10, 22], foliage: FOLIAGE.pine, foliageDark: FOLIAGE.pineDark, trunk: FOLIAGE.pineTrunk, tiers: [5, 7], faceJitter: 0.07 },
    shrub: { colours: [FOLIAGE.shrub, FOLIAGE.eucalyptB, FOLIAGE.eucalyptSilver, GROUND.grassDark], faceJitter: 0.1 },
    grass: { colours: [GROUND.grass, GROUND.grassLight, GROUND.grassDry, GROUND.grassDark] },
    rock: { colours: [GROUND.rock, TRACKSIDE.concreteDark, GROUND.gravel], lichen: GROUND.grassDry },
    lod: { treeSwitch: 140, treeHide: 2600, spectatorSwitch: 60, spectatorHide: 400, smallPropHide: 700 },
    people: {
      shirts: [
        LIVERY_COLOURS.heritageRed,
        LIVERY_COLOURS.fordBlue,
        LIVERY_COLOURS.racingWhite,
        LIVERY_COLOURS.carbonBlack,
        LIVERY_COLOURS.sunsetOrange,
        LIVERY_COLOURS.yellow,
        LIVERY_COLOURS.teal,
        BUILDING.accentBlue,
        BUILDING.grey,
      ],
      pants: [0x34465f, 0x2a2c30, 0x8b7d62, 0x4b5563, 0x6b5a45],
      skin: [0xe2b796, 0xc8956f, 0xa36d4a, 0xeec4a6, 0x7b4c32],
      hair: [0x2b2118, 0x5a3f2a, 0x9a7b55, 0xb5b0a8, 0x1c1814],
      hats: [LIVERY_COLOURS.carbonBlack, LIVERY_COLOURS.heritageRed, LIVERY_COLOURS.fordBlue, 0x8a7458, LIVERY_COLOURS.racingWhite],
    },
    grandstand: {
      fascia: [BUILDING.accentRed, BUILDING.white, BUILDING.accentBlue, BUILDING.accentYellow, BUILDING.white, BUILDING.darkGrey],
      roofBand: BUILDING.accentBlue,
    },
    pitBuilding: {
      signage: [BUILDING.white, BUILDING.accentRed, BUILDING.white, BUILDING.white, BUILDING.accentRed, BUILDING.darkGrey],
      signageStripe: [BUILDING.accentRed, BUILDING.white, BUILDING.darkGrey, BUILDING.accentRed, BUILDING.white, BUILDING.white],
    },
    crowd: {
      // Muted, real-crowd colours (team red/blue merch, black, white, denim, khaki) — not confetti.
      shirts: [0x9c2a2e, 0x8a2b2b, 0x2d4a7a, 0x2a3f66, 0x1f2124, 0x2a2c30, 0x1f2124, 0xd9d6cc, 0xbfbab0, 0x4b5d73, 0x7a6e58, 0x5d6b4a, 0xb04a2a, 0x6a6f75],
      teams: [0x9c2a2e, 0x2a3f66, 0x1f2124, 0x8a2b2b, 0x2d4a7a],
      teamShare: 0.6,
      jitter: 0.12,
    },
    camping: {
      tentFly: [BUILDING.colorbondGreen, LIVERY_COLOURS.fordBlue, LIVERY_COLOURS.sunsetOrange, BUILDING.grey, LIVERY_COLOURS.limeGreen, BUILDING.accentRed],
      gazebo: [LIVERY_COLOURS.racingWhite, LIVERY_COLOURS.fordBlue, LIVERY_COLOURS.heritageRed, LIVERY_COLOURS.carbonBlack, BUILDING.colorbondGreen],
      groundsheet: BUILDING.darkGrey,
      chairs: [BUILDING.accentBlue, LIVERY_COLOURS.carbonBlack, BUILDING.colorbondGreen, LIVERY_COLOURS.heritageRed],
      esky: LIVERY_COLOURS.racingWhite,
      awningStripe: BUILDING.grey,
      annexMat: BUILDING.colorbondGreen,
    },
    vehicles: {
      paint: [LIVERY_COLOURS.racingWhite, LIVERY_COLOURS.silver, LIVERY_COLOURS.carbonBlack, LIVERY_COLOURS.heritageRed, LIVERY_COLOURS.fordBlue, BUILDING.grey, BUILDING.colorbondGreen],
      tyre: TRACKSIDE.tyre,
      trim: BUILDING.darkGrey,
      glass: BUILDING.glass,
      chrome: TRACKSIDE.armco,
      tailLight: BUILDING.accentRed,
      headLight: BUILDING.white,
    },
    buildings: {
      roofs: [BUILDING.colorbondGreen, BUILDING.roofRed, BUILDING.roof, BUILDING.darkGrey],
      walls: [BUILDING.brick, BUILDING.offWhite, BUILDING.white, GROUND.sand],
      weatherboard: [BUILDING.white, BUILDING.offWhite, GROUND.sand, 0xc9d3c4],
    },
  };
}

/** The live look. Read it at build time; change it only through setPropsLook. */
export const PROPS_LOOK: PropsLook = defaultLook();

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

type Listener = (look: PropsLook) => void;
const listeners = new Set<Listener>();

function deepAssign(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = target[k];
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && cur !== null && typeof cur === 'object' && !Array.isArray(cur)) {
      deepAssign(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      target[k] = Array.isArray(v) ? [...v] : v;
    }
  }
}

/** Merges a partial look into PROPS_LOOK, clears cached assets and notifies subscribers (who should rebuild). */
export function setPropsLook(patch: DeepPartial<PropsLook>): PropsLook {
  deepAssign(PROPS_LOOK as unknown as Record<string, unknown>, patch as Record<string, unknown>);
  clearPropCache();
  for (const fn of listeners) fn(PROPS_LOOK);
  return PROPS_LOOK;
}

/** Restores the default look (and clears the cache). */
export function resetPropsLook(): PropsLook {
  const d = defaultLook();
  for (const k of Object.keys(d) as Array<keyof PropsLook>) (PROPS_LOOK as unknown as Record<string, unknown>)[k] = d[k];
  clearPropCache();
  for (const fn of listeners) fn(PROPS_LOOK);
  return PROPS_LOOK;
}

/**
 * Drops every cached prop asset so the next getPropAsset call rebuilds it with
 * the current look. Pass `dispose = true` only when no mesh still uses the old geometry.
 */
export function clearPropCache(dispose = false): void {
  clearAssetCache(dispose);
}

/** Subscribes to look changes. Returns an unsubscribe function. */
export function onPropsLookChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
