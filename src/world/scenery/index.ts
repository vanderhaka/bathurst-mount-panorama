import * as THREE from 'three';
import featuresJson from '@/track/data/features.json';
import { getGraphics, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import type { Terrain } from '@/world/terrain';
import { createTracksideLayer } from '@/world/scenery/trackside-layer';
import { placeBuildings } from '@/world/scenery/buildings';
import { buildPitLane, buildStoneSign } from '@/world/scenery/decor';
import { placeFacilities } from '@/world/scenery/facilities';
import { SpatialMask, type XZ } from '@/world/scenery/geo';
import { PropInstancer } from '@/world/scenery/instancer';
import { maskTvSightlines } from '@/world/scenery/tv-clearings';
import { placeCutRocks } from '@/world/scenery/cut-rocks';
import { buildTown } from '@/world/scenery/town';
import { buildPaddock } from '@/world/scenery/paddock';
import { buildVineyards } from '@/world/scenery/vineyards';
import { placeVegetationSteps } from '@/world/scenery/vegetation';
import type { ContactAo } from '@/art/ambient-occlusion';
import { createGumLayerSteps } from '@/world/scenery/gum-layer';
import { runSync, scaled, type Steps } from '@/world/cooperative';

const F = featuresJson as unknown as { parking: XZ[][]; water: XZ[][]; pitLane: XZ[][]; serviceRoads: XZ[][]; stoneSign: XZ[][] };

export interface Scenery {
  group: THREE.Group;
  stats: { trees: number; instances: number; batches: number };
  contactAo: ContactAo;
  /** Per-frame LOD / draw-distance update around the camera. */
  update(camera: THREE.Vector3): void;
  dispose(): void;
}

/** Everything that stands around the circuit, placed from real OpenStreetMap data where it exists. */
export function buildScenery(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Scenery {
  return runSync(buildScenerySteps(track, terrain, profile, quality));
}

/** The same scenery, handing the thread back between its categories and inside the big loops (see cooperative.ts). */
export function* buildScenerySteps(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Steps<Scenery> {
  const group = new THREE.Group();
  group.name = 'scenery';
  const mask = new SpatialMask(20);
  // Keep vegetation off car parks, water, the pit lane / paddock and service roads.
  for (const poly of [...F.parking, ...F.water]) for (const [x, z] of densify(poly, 8)) mask.add(x, z, 7);
  for (const lane of F.pitLane) for (const [x, z] of densify(lane, 10)) mask.add(x, z, 22);
  for (const road of F.serviceRoads) for (const [x, z] of densify(road, 10)) mask.add(x, z, 4);
  // Keep the white-stone "MOUNT PANORAMA" letters clear (8 m margin).
  for (const ring of F.stoneSign) for (const [x, z] of densify(ring, 4)) mask.add(x, z, 8);
  maskTvSightlines(track, terrain, mask);

  yield 0.02;
  const gums = yield* scaled(createGumLayerSteps(quality), 0.02, 0.2), inst = new PropInstancer(gums.getPropAsset);
  const detail = createTracksideLayer(track, terrain, mask, quality);
  yield 0.2;
  group.add(placeBuildings(track, terrain, inst, mask, detail));
  yield 0.25;
  group.add(placeFacilities(track, terrain, profile, inst, mask, detail.mappedTowers));
  yield 0.3;
  const paddock = buildPaddock(track, terrain, inst, mask);
  if (paddock) group.add(paddock);
  yield;
  const vines = buildVineyards(terrain, mask);
  if (vines) group.add(vines);
  yield;
  group.add(detail.groundDetails());
  yield 0.4;
  const trees = yield* scaled(placeVegetationSteps(terrain, inst, mask, QUALITY[quality].treeDensityScale, quality), 0.4, 0.8);
  placeCutRocks(track, terrain, inst);
  yield 0.8;
  group.add(detail.distanceDetails() ?? buildTown(terrain));
  yield;
  const stone = buildStoneSign(terrain);
  if (stone) group.add(stone);
  const pit = buildPitLane(track, terrain);
  if (pit) group.add(pit);
  yield 0.85;
  const { instances, batches } = yield* scaled(inst.buildSteps(), 0.85, 1);
  group.add(inst.group);
  let first = true;
  return {
    group,
    contactAo: inst.contactAo,
    stats: { trees, instances, batches },
    update(camera) {
      const g = getGraphics();
      detail.update(performance.now() / 1000);
      gums.update(performance.now() / 1000);
      if (first) { inst.updateAll(camera, g.treeLodDistance, g.propDrawDistance); first = false; }
      else inst.update(camera, g.treeLodDistance, g.propDrawDistance);
    },
    dispose() { detail.dispose(); inst.dispose(); gums.dispose(); },
  };
}

function densify(line: XZ[], step: number): XZ[] {
  const out: XZ[] = [];
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    for (let d = 0; d < len; d += step) out.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len]);
  }
  if (line.length) out.push(line[line.length - 1]);
  return out;
}
