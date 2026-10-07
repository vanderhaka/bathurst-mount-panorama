import * as THREE from 'three';
import featuresJson from '@/track/data/features.json';
import { getGraphics, QUALITY } from '@/config/graphics';
import type { QualityPreset } from '@/render/renderer';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import type { Terrain } from '@/world/terrain';
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
import { placeVegetation } from '@/world/scenery/vegetation';

const F = featuresJson as unknown as { parking: XZ[][]; water: XZ[][]; pitLane: XZ[][]; serviceRoads: XZ[][]; stoneSign: XZ[][] };

export interface Scenery {
  group: THREE.Group;
  stats: { trees: number; instances: number; batches: number };
  /** Per-frame LOD / draw-distance update around the camera. */
  update(camera: THREE.Vector3): void;
}

/** Everything that stands around the circuit, placed from real OpenStreetMap data where it exists. */
export function buildScenery(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Scenery {
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

  const inst = new PropInstancer();
  group.add(placeBuildings(track, terrain, inst, mask));
  group.add(placeFacilities(track, terrain, profile, inst, mask));
  const paddock = buildPaddock(track, terrain, inst, mask);
  if (paddock) group.add(paddock);
  const vines = buildVineyards(terrain, mask);
  if (vines) group.add(vines);
  const trees = placeVegetation(terrain, inst, mask, QUALITY[quality].treeDensityScale);
  placeCutRocks(track, terrain, inst);
  group.add(buildTown(terrain));
  const stone = buildStoneSign(terrain);
  if (stone) group.add(stone);
  const pit = buildPitLane(track, terrain);
  if (pit) group.add(pit);
  const { instances, batches } = inst.build();
  group.add(inst.group);
  let first = true;
  return {
    group,
    stats: { trees, instances, batches },
    update(camera) {
      const g = getGraphics();
      if (first) { inst.updateAll(camera, g.treeLodDistance, g.propDrawDistance); first = false; }
      else inst.update(camera, g.treeLodDistance, g.propDrawDistance);
    },
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
