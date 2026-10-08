import * as THREE from 'three';
import { getGraphics, QUALITY } from '@/config/graphics';
import { PROP_VARIANTS } from '@/props/registry';
import { buildStartGantry, buildVideoScreen } from '@/props/structures/gantry';
import { buildGrandstand } from '@/props/structures/grandstand';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import type { SpeedProfile } from '@/track/speed-profile';
import { buildAdelaidePitPavilion } from '@/world/adelaide-buildings';
import { goldCoastFootprintFits, goldCoastInfillSpecs, goldCoastPalmPlacements, goldCoastTowerSpecs } from '@/world/gold-coast-layout';
import { buildTowers } from '@/world/gold-coast-towers';
import type { Scenery } from '@/world/scenery';
import { SpatialMask, yawFacingTrack } from '@/world/scenery/geo';
import { PropInstancer } from '@/world/scenery/instancer';
import type { Terrain } from '@/world/terrain';

// 2025 map stands: [name, s, side (+1 left, -1 right), grandstand?, offset off the line (m)].
const STANDS: ReadonlyArray<readonly [string, number, 1 | -1, boolean, number]> = [
  ['S10', 2703, 1, false, 18], ['S11', 2801, -1, false, 22], ['S12', 2848, -1, true, 24], ['S13', 2907, -1, true, 21],
  ['S14', 15, -1, true, 24], ['S5', 445, 1, false, 14], ['S15', 611, -1, true, 29], ['S18', 1017, -1, false, 20],
  ['S19', 1282, -1, false, 16], ['S7', 1342, 1, false, 25], ['S22', 1522, -1, true, 11], ['S22A', 1580, -1, true, 9],
  ['S23', 2465, -1, true, 25]];
const TYRE_CORNERS = [1, 6, 7, 8, 9, 10, 13, 15];

/** Generated Surfers Paradise scenery: OSM skyline, street infill, palms, stands, pit garages and trackside furniture. */
export function buildGoldCoastScenery(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Scenery {
  const group = new THREE.Group(); group.name = 'gold-coast-scenery';
  const tier = QUALITY[quality], inst = new PropInstancer(), mask = new SpatialMask(20);
  const p: [number, number, number] = [0, 0, 0];
  const yawAlong = (s: number) => { const i = Math.floor(track.wrapS(s) / track.spacing); return Math.atan2(track.tx[i], track.tz[i]); };
  const wallAt = (s: number, side: number) => (side > 0 ? track.left : track.right).wall[Math.floor(track.wrapS(s) / track.spacing)];
  const place = (object: THREE.Group, s: number, d: number, yaw: number, width: number, depth: number): boolean => {
    pointAt(track, s, d, p);
    if (!goldCoastFootprintFits(terrain, { x: p[0], z: p[2], width, depth, yaw }, 1)) return false;
    object.position.set(p[0], terrain.heightAt(p[0], p[2]) + 0.015, p[2]); object.rotation.y = yaw;
    group.add(object);
    // Long buildings are masked along their length so no palm or pole stands inside them.
    const r = Math.min(width, depth) / 2 + 4, c = Math.cos(yaw), sn = Math.sin(yaw), step = r * 1.2;
    for (let u = -width / 2; u <= width / 2 + step / 2; u += step) {
      const x = p[0] + c * Math.min(u, width / 2), z = p[2] - sn * Math.min(u, width / 2);
      mask.add(x, z, r); inst.contactAo.add(x, z, Math.min(width, depth) / 2);
    }
    return true;
  };
  const towers = goldCoastTowerSpecs(track, terrain, quality), specs = [...towers, ...goldCoastInfillSpecs(track, terrain, quality, towers)];
  for (const t of specs) mask.add(t.x, t.z, Math.max(t.width, t.depth) / 2);
  const towerGroup = buildTowers(specs, quality);
  group.add(towerGroup);
  const gi = Math.floor(track.wrapS(track.gridLineS) / track.spacing);
  const gantry = buildStartGantry({ span: track.left.wall[gi] + track.right.wall[gi] + 2, height: 6.5 });
  pointAt(track, track.gridLineS, (track.left.wall[gi] - track.right.wall[gi]) / 2, p);
  gantry.position.set(p[0], -0.18, p[2]); gantry.rotation.y = yawAlong(track.gridLineS); group.add(gantry);
  let garages = 0;
  [-230, -50, 130].forEach((s, k) => {
    const pit = buildAdelaidePitPavilion(); pit.name = `gold-coast-pit-garages-${k}`;
    if (place(pit, s, 32, yawAlong(s) - Math.PI / 2, 172, 18)) garages++;
  });
  const stands: { placed: string[]; skipped: string[] } = { placed: [], skipped: [] };
  for (const [name, s, side, big, offset] of STANDS) {
    const rows = big ? 9 : 5, length = big ? 50 : 28;
    const stand = buildGrandstand({ length, rows, roof: big, crowd: quality === 'low' ? 0.16 : 0.42 * getGraphics().crowdDensity });
    stand.name = name === 'S14' ? 'gold-coast-finish-grandstand' : `gold-coast-grandstand-${name}`;
    const ok = place(stand, s, side * Math.max(offset, wallAt(s, side) + 11 + rows * 0.4), yawAlong(s) - side * Math.PI / 2, length + 15, rows * 0.8 + 5);
    (ok ? stands.placed : stands.skipped).push(name);
  }
  const screen = buildVideoScreen({ width: 9 });
  place(screen, 200, -(wallAt(200, -1) + 18), yawAlong(200) + Math.PI / 2, 10, 5);
  let trees = 0;
  for (const palm of goldCoastPalmPlacements(track, terrain, quality)) {
    if (mask.blocked(palm.x, palm.z, palm.radius)) continue;
    inst.add(palm.kind, palm.variant, palm.x, terrain.heightAt(palm.x, palm.z), palm.z, palm.yaw, palm.scale);
    mask.add(palm.x, palm.z, palm.radius * 0.5); trees++;
  }
  // Light poles stand on the footpaths, both sides, all the way round.
  for (let s = 0; s < track.length; s += 45) for (const side of [1, -1] as const) {
    pointAt(track, s, side * (wallAt(s, side) + 2.2), p);
    if (terrain.clearance(p[0], p[2]) < 1.5 || mask.blocked(p[0], p[2], 1.5)) continue;
    inst.add('lightPole', 0, p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]));
  }
  if (getGraphics().tracksideDetail && tier.tracksideDetail) for (const corner of track.corners) {
    const s = corner.s - 28;
    pointAt(track, s, wallAt(s, 1) + 4.5, p);
    if (terrain.clearance(p[0], p[2]) > 2 && !mask.blocked(p[0], p[2], 3)) {
      inst.add('marshalPost', corner.turn % PROP_VARIANTS.marshalPost, p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]), 0.8);
    }
  }
  // Braking markers use the actual owned speed profile.
  for (const corner of track.corners) {
    const i = Math.floor(track.wrapS(corner.s) / track.spacing);
    if (profile.speed[i] * 3.6 > 185) continue;
    const side = corner.dir === 'L' ? -1 : 1;
    for (const [distance, variant] of [[200, 1], [100, 2]] as const) {
      const s = corner.s - distance;
      pointAt(track, s, side * (wallAt(s, side) + 1.3), p);
      if (terrain.clearance(p[0], p[2]) < 0.9) continue;
      inst.add('distanceBoard', variant, p[0], terrain.heightAt(p[0], p[2]), p[2], yawAlong(s) + Math.PI, 0.75);
    }
  }
  // Tyre stacks against the outside wall of the tight corners.
  for (const corner of track.corners) if (TYRE_CORNERS.includes(corner.turn)) {
    const side = corner.dir === 'L' ? -1 : 1;
    for (let k = 0, s = corner.s - 12; s <= corner.s + 12; s += 1.2, k++) {
      pointAt(track, s, side * (wallAt(s, side) - 0.35), p);
      inst.add('tyreStack', k % PROP_VARIANTS.tyreStack, p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]));
    }
  }
  let seed = 8821;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  if (quality !== 'low') for (let i = 0; i < 70; i++) {
    const s = 1330 + random() * 200;
    pointAt(track, s, -(wallAt(s, -1) + 4 + random() * 4), p);
    if (terrain.clearance(p[0], p[2]) < 2 || mask.blocked(p[0], p[2], 0.7)) continue;
    inst.add('spectator', i % PROP_VARIANTS.spectator, p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]), 1,
      [0x6f7b71, 0x344c65, 0x913f36, 0xcec9b5][i % 4]);
  }
  const stats = inst.build(); group.add(inst.group);
  group.userData.layout = { garages, stands };
  let first = true, disposed = false;
  const startMaterials = gantry.getObjectByName('start-lights')?.children.map(o => (o as THREE.Mesh).material as THREE.Material) ?? [];
  return { group, stats: { ...stats, trees }, contactAo: inst.contactAo, update(camera) {
    if (disposed) return;
    const cfg = getGraphics();
    if (first) { inst.updateAll(camera, cfg.treeLodDistance, cfg.propDrawDistance); first = false; }
    else inst.update(camera, cfg.treeLodDistance, cfg.propDrawDistance);
  }, dispose() {
    if (disposed) return; disposed = true;
    inst.dispose(); startMaterials.forEach(material => material.dispose()); (towerGroup.userData.dispose as () => void)();
    group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); group.clear();
  } };
}
