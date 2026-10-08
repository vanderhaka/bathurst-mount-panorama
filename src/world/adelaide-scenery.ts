import * as THREE from 'three';
import { getGraphics, QUALITY } from '@/config/graphics';
import { PROP_VARIANTS } from '@/props/registry';
import { buildStartGantry, buildVideoScreen } from '@/props/structures/gantry';
import { buildGrandstand } from '@/props/structures/grandstand';
import { StructureParts, V } from '@/props/structures/parts';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { pointAt } from '@/track/track-query';
import type { SpeedProfile } from '@/track/speed-profile';
import { adelaideFootprintFits, adelaideOpenLawn, adelaideTreePlacements } from '@/world/adelaide-layout';
import { buildAdelaideCity, buildAdelaidePitPavilion } from '@/world/adelaide-buildings';
import type { Scenery } from '@/world/scenery';
import { rng, SpatialMask, yawFacingTrack } from '@/world/scenery/geo';
import { createGumLayer } from '@/world/scenery/gum-layer';
import { PropInstancer } from '@/world/scenery/instancer';
import type { Terrain } from '@/world/terrain';

/** Generated city/parkland scenery only: no Mount Panorama structures, forest or camps. */
export function buildAdelaideScenery(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Scenery {
  const group = new THREE.Group(); group.name = 'adelaide-scenery';
  const tier = QUALITY[quality], gums = createGumLayer(quality), inst = new PropInstancer(gums.getPropAsset), mask = new SpatialMask(20);
  const p: [number, number, number] = [0, 0, 0], random = rng(3219);
  const yawAlong = (s: number) => { const i = Math.floor(track.wrapS(s) / track.spacing); return Math.atan2(track.tx[i], track.tz[i]); };
  const place = (object: THREE.Group, s: number, d: number, yaw: number, width: number, depth: number): boolean => {
    pointAt(track, s, d, p);
    if (!adelaideFootprintFits(terrain, { x: p[0], z: p[2], width, depth, yaw }, 1)) return false;
    object.position.set(p[0], terrain.heightAt(p[0], p[2]) + 0.015, p[2]); object.rotation.y = yaw;
    group.add(object); mask.add(p[0], p[2], Math.min(width, depth) / 2 + 4);
    inst.contactAo.add(p[0], p[2], Math.min(width, depth) / 2); return true;
  };
  group.add(buildAdelaideCity(track, terrain, quality));
  const finish = track.startLineS, gi = Math.floor(track.wrapS(track.gridLineS) / track.spacing);
  const gantry = buildStartGantry({ span: track.left.wall[gi] + track.right.wall[gi] + 2, height: 6.5 });
  pointAt(track, track.gridLineS, (track.left.wall[gi] - track.right.wall[gi]) / 2, p);
  gantry.position.set(p[0], -0.18, p[2]); gantry.rotation.y = yawAlong(track.gridLineS); group.add(gantry);
  const pitS = finish + 22, pi = Math.floor(track.wrapS(pitS) / track.spacing);
  const pit = buildAdelaidePitPavilion();
  // Inside the park circuit loop (driver's right), with a clear pit apron in front.
  place(pit, pitS, -(track.right.wall[pi] + 26), yawAlong(pitS) + Math.PI / 2, 179, 27);
  for (const [s, length, rows, roof] of [[finish - 104, 65, 9, true], [finish - 23, 65, 9, true],
    [finish + 106, 65, 9, true], [270, 58, 7, false], [1580, 70, 8, false]] as const) {
    const i = Math.floor(track.wrapS(s) / track.spacing), side = s === 1580 ? -1 : 1;
    const wall = side > 0 ? track.left.wall[i] : track.right.wall[i];
    const stand = buildGrandstand({ length, rows, roof, crowd: quality === 'low' ? 0.16 : 0.42 * getGraphics().crowdDensity });
    stand.name = s === finish - 23 ? 'adelaide-finish-grandstand' : `adelaide-grandstand-${s}`;
    place(stand, s, side * (wall + 11 + rows * 0.4), yawAlong(s) - side * Math.PI / 2, length + 15, rows * 0.8 + 5);
  }
  const screen = buildVideoScreen({ width: 9 });
  const screenS = finish + 175, si = Math.floor(track.wrapS(screenS) / track.spacing);
  place(screen, screenS, track.left.wall[si] + 21, yawAlong(screenS) - Math.PI / 2, 10, 5);
  let trees = 0;
  for (const tree of adelaideTreePlacements(track, terrain, quality)) {
    if (mask.blocked(tree.x, tree.z, tree.radius)) continue;
    inst.add('eucalyptus', tree.variant, tree.x, terrain.heightAt(tree.x, tree.z), tree.z, tree.yaw, tree.scale);
    mask.add(tree.x, tree.z, tree.radius * 0.5); trees++;
  }
  // Street furniture is sparse and anchored behind the barriers, with no signs in the racing line.
  for (let s = 470; s < 2390; s += 49) {
    const i = Math.floor(s / track.spacing);
    pointAt(track, s, track.left.wall[i] + 8.5, p);
    if (terrain.clearance(p[0], p[2]) < 3 || mask.blocked(p[0], p[2], 1.5)) continue;
    inst.add('lightPole', 0, p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]));
  }
  if (getGraphics().tracksideDetail && tier.tracksideDetail) for (const corner of track.corners) {
    const s = corner.s - 28, i = Math.floor(track.wrapS(s) / track.spacing);
    pointAt(track, s, track.left.wall[i] + 4.5, p);
    if (terrain.clearance(p[0], p[2]) > 2 && !mask.blocked(p[0], p[2], 3)) {
      inst.add('marshalPost', corner.turn % PROP_VARIANTS.marshalPost, p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]), 0.8);
    }
  }
  // Braking markers use the actual owned speed profile, rather than Bathurst distance assumptions.
  for (const corner of track.corners) {
    const i = Math.floor(track.wrapS(corner.s) / track.spacing);
    if (profile.speed[i] * 3.6 > 185) continue;
    const side = corner.dir === 'L' ? -1 : 1;
    for (const [distance, variant] of [[200, 1], [100, 2]] as const) {
      const s = corner.s - distance, j = Math.floor(track.wrapS(s) / track.spacing), arr = side > 0 ? track.left : track.right;
      pointAt(track, s, side * (arr.wall[j] + 1.3), p);
      if (terrain.clearance(p[0], p[2]) < 0.9) continue;
      inst.add('distanceBoard', variant, p[0], terrain.heightAt(p[0], p[2]), p[2], yawAlong(s) + Math.PI, 0.75);
    }
  }
  const fence = parkRail(track, terrain); group.add(fence);
  if (quality !== 'low') for (let i = 0; i < 65; i++) {
    const s = finish - 135 + random() * 280, j = Math.floor(track.wrapS(s) / track.spacing);
    pointAt(track, s, track.left.wall[j] + 4 + random() * 4, p);
    if (terrain.clearance(p[0], p[2]) < 2 || mask.blocked(p[0], p[2], 0.7)) continue;
    inst.add('spectator', i % PROP_VARIANTS.spectator, p[0], terrain.heightAt(p[0], p[2]), p[2], yawAlong(s) - Math.PI / 2, 1,
      [0x6f7b71, 0x344c65, 0x913f36, 0xcec9b5][i % 4]);
  }
  const stats = inst.build(); group.add(inst.group);
  let first = true, disposed = false;
  const startMaterials = gantry.getObjectByName('start-lights')?.children.map(o => (o as THREE.Mesh).material as THREE.Material) ?? [];
  return { group, stats: { ...stats, trees }, contactAo: inst.contactAo, update(camera) {
    if (disposed) return;
    const cfg = getGraphics(); gums.update(performance.now() / 1000);
    if (first) { inst.updateAll(camera, cfg.treeLodDistance, cfg.propDrawDistance); first = false; }
    else inst.update(camera, cfg.treeLodDistance, cfg.propDrawDistance);
  }, dispose() {
    if (disposed) return; disposed = true;
    inst.dispose(); gums.dispose(); startMaterials.forEach(material => material.dispose());
    group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); group.clear();
  } };
}

/** Low pedestrian rail at the park edge, separate from the race's full catch fences. */
function parkRail(track: Track, terrain: Terrain): THREE.Group {
  const parts = new StructureParts(), p: [number, number, number] = [0, 0, 0];
  let previous: THREE.Vector3 | null = null;
  for (let s = 1330; s < 1790; s += 8) {
    const i = Math.floor(s / track.spacing);
    pointAt(track, s, -(track.right.wall[i] + 9), p);
    if (terrain.clearance(p[0], p[2]) < 3 || adelaideOpenLawn(p[0], p[2])) { previous = null; continue; }
    const point = V(p[0], terrain.heightAt(p[0], p[2]), p[2]);
    parts.beam(point, point.clone().add(V(0, 1.1, 0)), 0.035, 0x656c67, 5);
    if (previous) for (const h of [0.48, 0.97]) parts.beam(previous.clone().add(V(0, h, 0)), point.clone().add(V(0, h, 0)), 0.025, 0x81867b, 5);
    previous = point;
  }
  return parts.toGroup('adelaide-park-rail');
}
