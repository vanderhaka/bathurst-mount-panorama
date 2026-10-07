import * as THREE from 'three';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { placeKerbs, type KerbLayout } from '@/track/kerbs';
import { computeRacingLine, type RacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE, type SpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { buildBarriers, buildVerges } from '@/world/barriers';
import { buildRoad } from '@/world/road';
import { buildWallSigns } from '@/world/wall-signs';
import { buildTerrain, type Terrain } from '@/world/terrain';
import { buildScenery, type Scenery } from '@/world/scenery';
import type { QualityPreset } from '@/render/renderer';
import { getGraphics, QUALITY } from '@/config/graphics';

export interface World {
  track: Track;
  line: RacingLine;
  profile: SpeedProfile;
  kerbs: KerbLayout;
  terrain: Terrain;
  scenery: Scenery;
  root: THREE.Group;
  /** Lights the first n start lights on the grid gantry (0 or less = all off). */
  setStartLights: (n: number) => void;
}

export type ProgressFn = (fraction: number, label: string) => Promise<void> | void;

/** Builds the circuit and its surroundings. Yields between stages so a loading bar can update. */
export async function buildWorld(
  renderer: THREE.WebGLRenderer,
  progress: ProgressFn = () => {},
  quality: QualityPreset = 'high',
  /** Reuse the track model (visual rebuild only, e.g. after graphics tuning). */
  reuse?: Pick<World, 'track' | 'line' | 'profile' | 'kerbs'>,
): Promise<World> {
  const root = new THREE.Group();
  root.name = 'world';
  await progress(0.05, 'Reading Mount Panorama survey data');
  const track = reuse?.track ?? new Track();
  await progress(0.12, 'Computing the racing line');
  const line = reuse?.line ?? computeRacingLine(track);
  const profile = reuse?.profile ?? computeSpeedProfile(track, line, tunedSpec(CAR_SPECS.camaro, DEFAULT_HANDLING), LINE_PROFILE);
  const kerbs = reuse?.kerbs ?? placeKerbs(track, line);
  await progress(0.25, 'Laying the asphalt');
  const cfg = getGraphics(), tier = QUALITY[quality];
  root.add(buildRoad(track, line, kerbs, renderer, {
    profile, detailSize: tier.detailMapSize, surfaceDetail: cfg.surfaceDetail && tier.surfaceDetail,
    normalStrength: cfg.roadNormalStrength, repairStrength: cfg.roadRepairStrength,
    rubberGroove: cfg.rubberGroove, skids: cfg.roadSkids && tier.skids,
    kerbWear: cfg.kerbWear, lineWear: cfg.lineWear,
  }));
  root.add(buildVerges(track, kerbs));
  await progress(0.4, 'Building concrete walls and catch fences');
  root.add(buildBarriers(track, renderer, quality));
  root.add(buildWallSigns(track, quality));
  await progress(0.55, 'Shaping the mountain');
  const terrain = buildTerrain(track, undefined, quality);
  root.add(terrain.group);
  await progress(0.7, 'Planting gum trees and pitching tents');
  const scenery = buildScenery(track, terrain, profile, quality);
  scenery.contactAo.bake(terrain.group, getGraphics().bakedAo);
  // Grass has instance-local geometry; keep it outside the terrain's AO bake.
  terrain.group.add(terrain.grass.group);
  const updateScenery = scenery.update;
  scenery.update = (camera) => {
    updateScenery(camera);
    terrain.grass.setWind(getGraphics().grassWind);
    terrain.grass.update(camera.x, camera.z, performance.now() / 1000);
  };
  root.add(scenery.group);
  await progress(0.95, 'World ready');
  const lights = root.getObjectByName('start-lights');
  const setLit = lights?.userData.setLit as ((n: number) => void) | undefined;
  let lit = -2;
  const setStartLights = (n: number) => {
    if (n !== lit) setLit?.(n);
    lit = n;
  };
  return { track, line, profile, kerbs, terrain, scenery, root, setStartLights };
}

/** Frees GPU resources of a world's meshes (geometries only; materials are shared/cached). */
export function disposeWorld(world: World): void {
  world.scenery.dispose();
  world.terrain.dispose();
  world.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
