import type * as THREE from 'three';
import type { InstancedPropKind } from '@/types/props';
import type { BuiltProp, KindBuilder } from '@/props/kinds-types';
import { rockMaterial, treeMaterial } from '@/props/core/materials';
import { buildPalm, PALM_VARIANTS } from '@/props/trees/palm';
import { buildEucalyptus, buildPineTree, buildYoungEucalyptus, TREE_VARIANTS } from '@/props/trees';
import { buildFallenBark, buildGumShrub } from '@/props/trees/gum-undergrowth';
import { buildRock } from '@/props/builders/rock';
import { buildGrassTuft, buildShrub, VEGETATION_VARIANTS } from '@/props/builders/vegetation';
import { buildBillboard, buildDistanceBoard, buildTrackPole, buildTyreStack, TRACKSIDE_VARIANTS } from '@/props/builders/trackside';
import { buildFlagPole, buildLightPole, buildTvCameraTower, POLE_VARIANTS } from '@/props/builders/poles';
import { buildMarshalPost, buildPortaloo, HUT_VARIANTS } from '@/props/builders/huts';
import { buildSpectator, buildSpectatorSeated, PEOPLE_VARIANTS } from '@/props/builders/people';
import { buildGazebo, buildTent, CAMPING_VARIANTS } from '@/props/builders/camping';
import { buildRoadCar, VEHICLE_VARIANTS } from '@/props/builders/vehicles';
import { buildCampervan, buildCaravan, CARAVAN_VARIANTS } from '@/props/builders/caravans';
import { buildShed, buildWaterTank, RURAL_VARIANTS } from '@/props/builders/rural';
import { buildHouse, HOUSE_VARIANTS } from '@/props/builders/house';

export type { BuiltProp, KindBuilder } from '@/props/kinds-types';

// Kind table: variant count, tint / shadow flags and the builder for each instanced prop.

const tree = (fn: (v: number) => { near: THREE.BufferGeometry; far: THREE.BufferGeometry; radius: number; height: number }) => (v: number): BuiltProp => {
  const r = fn(v);
  return { geometry: r.near, lod: r.far, radius: r.radius, height: r.height };
};

export const KIND_BUILDERS: Record<InstancedPropKind, KindBuilder> = {
  eucalyptus: { variants: TREE_VARIANTS.eucalyptus, tintable: false, castShadow: true, foliage: true, gumSurface: true, material: treeMaterial, build: tree(buildEucalyptus) },
  eucalyptusYoung: { variants: TREE_VARIANTS.eucalyptusYoung, tintable: false, castShadow: true, foliage: true, gumSurface: true, material: treeMaterial, build: tree(buildYoungEucalyptus) },
  pine: { variants: TREE_VARIANTS.pine, tintable: false, castShadow: true, foliage: true, build: tree(buildPineTree) },
  palm: { variants: PALM_VARIANTS, tintable: false, castShadow: true, foliage: true, build: tree(buildPalm) },
  shrub: { variants: VEGETATION_VARIANTS.shrub, tintable: false, castShadow: true, foliage: true, build: buildShrub },
  gumShrub: { variants: 6, tintable: false, castShadow: true, foliage: true, gumSurface: true, build: tree(buildGumShrub) },
  fallenBark: { variants: 6, tintable: false, castShadow: false, gumSurface: true, build: v => ({ geometry: buildFallenBark(v) }) },
  rock: { variants: VEGETATION_VARIANTS.rock, tintable: false, castShadow: true, material: rockMaterial, build: buildRock },
  grassTuft: { variants: VEGETATION_VARIANTS.grassTuft, tintable: false, castShadow: false, foliage: true, build: buildGrassTuft },
  tyreStack: { variants: TRACKSIDE_VARIANTS.tyreStack, tintable: false, castShadow: true, build: buildTyreStack },
  marshalPost: { variants: HUT_VARIANTS.marshalPost, tintable: false, castShadow: true, build: buildMarshalPost },
  lightPole: { variants: POLE_VARIANTS.lightPole, tintable: false, castShadow: true, build: buildLightPole },
  flagPole: { variants: POLE_VARIANTS.flagPole, tintable: true, castShadow: true, build: buildFlagPole },
  trackPole: { variants: TRACKSIDE_VARIANTS.trackPole, tintable: false, castShadow: true, build: buildTrackPole },
  tvCameraTower: { variants: POLE_VARIANTS.tvCameraTower, tintable: false, castShadow: true, build: buildTvCameraTower },
  spectator: { variants: PEOPLE_VARIANTS.spectator, tintable: true, castShadow: true, build: buildSpectator },
  spectatorSeated: { variants: PEOPLE_VARIANTS.spectatorSeated, tintable: true, castShadow: true, build: buildSpectatorSeated },
  tent: { variants: CAMPING_VARIANTS.tent, tintable: true, castShadow: true, build: buildTent },
  gazebo: { variants: CAMPING_VARIANTS.gazebo, tintable: true, castShadow: true, build: buildGazebo },
  caravan: { variants: CARAVAN_VARIANTS.caravan, tintable: true, castShadow: true, build: buildCaravan },
  campervan: { variants: CARAVAN_VARIANTS.campervan, tintable: true, castShadow: true, build: buildCampervan },
  roadCar: { variants: VEHICLE_VARIANTS.roadCar, tintable: true, castShadow: true, build: buildRoadCar },
  portaloo: { variants: HUT_VARIANTS.portaloo, tintable: false, castShadow: true, build: buildPortaloo },
  waterTank: { variants: RURAL_VARIANTS.waterTank, tintable: false, castShadow: true, build: buildWaterTank },
  house: { variants: HOUSE_VARIANTS.house, tintable: false, castShadow: true, build: buildHouse },
  shed: { variants: RURAL_VARIANTS.shed, tintable: false, castShadow: true, build: buildShed },
  billboard: { variants: TRACKSIDE_VARIANTS.billboard, tintable: true, castShadow: true, build: buildBillboard },
  distanceBoard: { variants: TRACKSIDE_VARIANTS.distanceBoard, tintable: false, castShadow: true, build: buildDistanceBoard },
};
