import * as THREE from 'three';
import { circuitCarSpec } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { placeKerbs, type KerbLayout } from '@/track/kerbs';
import { racingLineSteps, type RacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE, type SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import { loadTrack } from '@/track/load-track';
import { buildBarriers, buildVerges } from '@/world/barriers';
import { buildRoadSteps } from '@/world/road';
import { runCooperative } from '@/world/cooperative';
import { buildWallSigns } from '@/world/wall-signs';
import type { Terrain } from '@/world/terrain';
import type { Scenery } from '@/world/scenery';
import { CIRCUIT_WORLDS } from '@/world/circuit-world';
import type { QualityPreset } from '@/render/renderer';
import { getGraphics, QUALITY } from '@/config/graphics';
import { disposeUnusedTextures } from '@/world/dispose-textures';
import { ACTIVE_CIRCUIT, CIRCUITS, type CircuitId } from '@/track/circuits';

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
  /** Reuse the track model (visual rebuild only, e.g. after graphics tuning); ignored when it is another circuit. */
  reuse?: Pick<World, 'track' | 'line' | 'profile' | 'kerbs'>,
  circuit: CircuitId = reuse?.track.id ?? ACTIVE_CIRCUIT,
): Promise<World> {
  const root = new THREE.Group();
  root.name = 'world';
  if (reuse && reuse.track.id !== circuit) reuse = undefined;
  await progress(0.05, `Reading ${CIRCUITS[circuit].name} circuit data`);
  const track = reuse?.track ?? (await loadTrack(circuit));
  const circuitWorld = CIRCUIT_WORLDS[track.id];
  await progress(0.12, 'Computing the racing line');
  const line = reuse?.line ?? (await runCooperative(racingLineSteps(track), progress, 0.12, 0.25, 'Computing the racing line'));
  const profile = reuse?.profile ?? computeSpeedProfile(track, line, tunedSpec(circuitCarSpec('camaro', track.id), DEFAULT_HANDLING), LINE_PROFILE);
  const kerbs = reuse?.kerbs ?? placeKerbs(track, line);
  await progress(0.25, 'Laying the asphalt');
  const cfg = getGraphics(), tier = QUALITY[quality];
  // The heavy builders hand the thread back every few milliseconds, so the page stays responsive while they run.
  root.add(await runCooperative(buildRoadSteps(track, line, kerbs, renderer, {
    profile, detailSize: tier.detailMapSize, surfaceDetail: cfg.surfaceDetail && tier.surfaceDetail,
    normalStrength: cfg.roadNormalStrength, repairStrength: cfg.roadRepairStrength,
    rubberGroove: cfg.rubberGroove, skids: cfg.roadSkids && tier.skids,
    kerbWear: cfg.kerbWear, lineWear: cfg.lineWear,
  }), progress, 0.25, 0.4, 'Laying the asphalt'));
  await progress(0.4, 'Building concrete walls and catch fences');
  root.add(buildBarriers(track, renderer, quality));
  root.add(buildWallSigns(track, quality));
  await progress(0.55, circuitWorld.terrainLabel);
  const terrain = await runCooperative(await circuitWorld.terrainSteps(track, quality), progress, 0.55, 0.7, circuitWorld.terrainLabel);
  root.add(terrain.group);
  root.add(buildVerges(track, kerbs, terrain.material));
  await progress(0.7, circuitWorld.sceneryLabel);
  const scenery = await runCooperative(await circuitWorld.scenerySteps(track, terrain, profile, quality), progress, 0.7, 0.92, circuitWorld.sceneryLabel);
  await runCooperative(scenery.contactAo.bakeSteps(terrain.group, tier.bakedAo ? cfg.bakedAo : 0), progress, 0.92, 0.95, circuitWorld.sceneryLabel);
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

/** Frees geometries and unused texture storage; shared/cached materials are kept. */
export function disposeWorld(world: World, retained?: World): void {
  disposeUnusedTextures(world.root, retained?.root);
  world.scenery.dispose();
  world.terrain.dispose();
  world.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
}
