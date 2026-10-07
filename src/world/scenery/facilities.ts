import * as THREE from 'three';
import featuresJson from '@/track/data/features.json';
import { PROP_VARIANTS, structures } from '@/props';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import { createTrackPoint, pointAt, projectToTrack } from '@/track/track-query';
import type { Terrain } from '@/world/terrain';
import { buildBillboards, type BillboardPlacement } from '@/world/scenery/billboards';
import { rng, yawFacingTrack, type SpatialMask, type XZ } from '@/world/scenery/geo';
import type { PropInstancer } from '@/world/scenery/instancer';

const F = featuresJson as unknown as {
  campPitches: XZ[]; videoWalls: XZ[]; marshalPosts: Array<{ name: string; xz: XZ }>; footbridges: XZ[][]; towers: XZ[]; parking: XZ[][];
};

const TENT_COLOURS = [0x2f6db5, 0xd94f2b, 0x3f8f4a, 0xe0b62e, 0x6b4fa3, 0xe8e6df, 0x1f9aa3, 0xc23b6a];
const SHIRTS = [0x9c2a2e, 0x2d4a7a, 0xd9d6cc, 0x1f2124, 0x4b5d73, 0x7a6e58, 0x5d6b4a, 0x6a6f75];
const CAR_PAINT = [0xe9e9e6, 0x2a2d31, 0x8a9096, 0x8c1c13, 0x1d3f7a, 0x6f7a5a, 0xc9b79c];

/** Grid gantry, footbridges, big screens, marshal posts, campers, billboards, braking boards and crowds. */
export function placeFacilities(track: Track, terrain: Terrain, profile: SpeedProfile, inst: PropInstancer, mask: SpatialMask): THREE.Group {
  const group = new THREE.Group();
  group.name = 'facilities';
  const r = rng(4242);
  const p: [number, number, number] = [0, 0, 0];
  const at = (s: number, d: number) => pointAt(track, s, d, p);
  const yawAlong = (s: number) => {
    const i = Math.floor(track.wrapS(s) / track.spacing);
    return Math.atan2(track.tx[i], track.tz[i]);
  };

  // Start/finish gantry over the standing-start line (lights) and the finish-line footbridge.
  const gi = Math.round(track.gridLineS / track.spacing);
  const span = track.left.wall[gi] + track.right.wall[gi] + 2;
  const gantry = structures.startGantry({ span, height: 6.5 });
  at(track.gridLineS, (track.left.wall[gi] - track.right.wall[gi]) / 2);
  gantry.position.set(p[0], p[1], p[2]);
  // Structures span along their local X; yaw = heading turns local X onto the track's left normal.
  gantry.rotation.y = yawAlong(track.gridLineS);
  group.add(gantry);

  // Footbridges mapped in OSM that cross the circuit (finish line, Conrod).
  for (const fb of F.footbridges) {
    // Place the bridge where its mapped path crosses the centreline (the path may include stairs).
    const i = crossingIndex(track, fb);
    if (i < 0) continue;
    const bridge = structures.footBridge({ span: track.left.wall[i] + track.right.wall[i] + 4, clearance: 5.6 });
    at(i * track.spacing, (track.left.wall[i] - track.right.wall[i]) / 2);
    bridge.position.set(p[0], p[1], p[2]);
    bridge.rotation.y = yawAlong(i * track.spacing);
    group.add(bridge);
  }

  // Temporary big screens (OSM), facing the track.
  for (const [x, z] of F.videoWalls) {
    const screen = structures.videoScreen({ width: 9 });
    screen.position.set(x, terrain.heightAt(x, z), z);
    screen.rotation.y = yawFacingTrack(track, x, z);
    group.add(screen);
    mask.add(x, z, 6);
  }

  // Marshal posts at their mapped positions.
  for (const m of F.marshalPosts) {
    const [x, z] = m.xz;
    inst.add('marshalPost', 0, x, terrain.heightAt(x, z), z, yawFacingTrack(track, x, z), 1);
    mask.add(x, z, 3);
  }

  // Comms / TV lattice towers.
  for (const [x, z] of F.towers) inst.add('tvCameraTower', 0, x, terrain.heightAt(x, z), z, r() * 6.28, 1.6);

  // Camp pitches: a tent, gazebo or caravan per pitch, often with a car.
  for (const [x, z] of F.campPitches) {
    mask.add(x, z, 4);
    if (terrain.clearance(x, z) < 3) continue;
    const y = terrain.heightAt(x, z);
    const yaw = r() * Math.PI * 2;
    const roll = r();
    if (roll < 0.45) inst.add('tent', Math.floor(r() * PROP_VARIANTS.tent), x, y, z, yaw, 1, TENT_COLOURS[Math.floor(r() * TENT_COLOURS.length)]);
    // Caravans and campervans: the instance colour paints their stripe and awning.
    else if (roll < 0.65) inst.add('caravan', Math.floor(r() * PROP_VARIANTS.caravan), x, y, z, yaw, 1, TENT_COLOURS[Math.floor(r() * TENT_COLOURS.length)]);
    else if (roll < 0.78) inst.add('campervan', Math.floor(r() * PROP_VARIANTS.campervan), x, y, z, yaw, 1, TENT_COLOURS[Math.floor(r() * TENT_COLOURS.length)]);
    else inst.add('gazebo', Math.floor(r() * PROP_VARIANTS.gazebo), x, y, z, yaw, 1, TENT_COLOURS[Math.floor(r() * TENT_COLOURS.length)]);
    if (r() < 0.55) {
      const cx = x + Math.cos(yaw) * 4, cz = z + Math.sin(yaw) * 4;
      inst.add('roadCar', Math.floor(r() * PROP_VARIANTS.roadCar), cx, terrain.heightAt(cx, cz), cz, yaw + 1.2, 1, CAR_PAINT[Math.floor(r() * CAR_PAINT.length)]);
    }
    if (r() < 0.35) {
      const sx = x + (r() - 0.5) * 6, sz = z + (r() - 0.5) * 6;
      inst.add('spectator', Math.floor(r() * PROP_VARIANTS.spectator), sx, terrain.heightAt(sx, sz), sz, yawFacingTrack(track, sx, sz), 1, SHIRTS[Math.floor(r() * SHIRTS.length)]);
    }
  }

  // Parked cars in the mapped car parks.
  for (const lot of F.parking) {
    const xs = lot.map((q) => q[0]), zs = lot.map((q) => q[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    for (let k = 0; k < Math.min(60, ((x1 - x0) * (z1 - z0)) / 80); k++) {
      const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
      if (terrain.clearance(x, z) < 4 || mask.blocked(x, z, 1)) continue;
      inst.add('roadCar', Math.floor(r() * PROP_VARIANTS.roadCar), x, terrain.heightAt(x, z), z, r() < 0.5 ? 0 : Math.PI, 1, CAR_PAINT[Math.floor(r() * CAR_PAINT.length)]);
      mask.add(x, z, 2.5);
    }
  }

  const boards: BillboardPlacement[] = [];
  placeTrackside(track, terrain, profile, inst, r, at, boards, mask);
  group.add(buildBillboards(boards));
  return group;
}

/** Billboards behind the walls, braking boards before the big stops, and crowds at the famous spots. */
function placeTrackside(track: Track, terrain: Terrain, profile: SpeedProfile, inst: PropInstancer, r: () => number, at: (s: number, d: number) => number[], boards: BillboardPlacement[], mask: SpatialMask): void {
  // Hoardings every 40 m on straights, alternating sides, just behind the barrier.
  for (let s = 0; s < track.length; s += 40) {
    const i = Math.floor(s / track.spacing);
    if (Math.abs(track.curvature[i]) > 1 / 300 || r() < 0.35) continue;
    const side = r() < 0.5 ? 1 : -1;
    const sideArr = side > 0 ? track.left : track.right;
    const p = at(s, side * (sideArr.wall[i] + 2.2));
    // Not in the pit lane, car parks, roads or buildings.
    if (terrain.clearance(p[0], p[2]) < 1.5 || mask.blocked(p[0], p[2], 3)) continue;
    boards.push({ x: p[0], y: terrain.heightAt(p[0], p[2]), z: p[2], yaw: yawFacingTrack(track, p[0], p[2]), s });
  }
  // Braking boards (300/200/100) before every stop of more than 70 km/h, on the outside.
  const n = track.n;
  for (let i = 0; i < n; i++) {
    const v0 = profile.speed[i], v1 = profile.speed[(i + 1) % n];
    const prev = profile.speed[(i - 1 + n) % n];
    if (!(v1 < v0 && prev <= v0)) continue; // start of a braking zone
    let k = i, vmin = v0;
    while (profile.speed[(k + 1) % n] <= profile.speed[k % n] && k - i < 200) { k++; vmin = profile.speed[k % n]; }
    if ((v0 - vmin) * 3.6 < 70) continue;
    const minS = k * track.spacing;
    const turnLeft = track.curvature[k % n] > 0;
    const side = turnLeft ? -1 : 1; // outside of the corner
    for (const [dist, variant] of [[300, 2], [200, 1], [100, 0]] as const) {
      const s = minS - 25 - dist;
      const j = Math.floor(track.wrapS(s) / track.spacing);
      const sideArr = side > 0 ? track.left : track.right;
      const p = at(s, side * (sideArr.edge[j] + Math.min(2, (sideArr.wall[j] - sideArr.edge[j]) * 0.6)));
      // Boards face the approaching cars.
      const yaw = Math.atan2(track.tx[j], track.tz[j]) + Math.PI;
      inst.add('distanceBoard', Math.min(variant, PROP_VARIANTS.distanceBoard - 1), p[0], p[1], p[2], yaw, 1);
    }
    i = k;
  }
  // Spectators along the fences at the famous viewing spots.
  const spots: Array<[number, number, number]> = [[2950, 3260, -1], [3330, 3450, 1], [5550, 5800, -1], [6100, 6213, -1], [430, 560, -1], [1560, 1700, 1]];
  for (const [s0, s1, side] of spots) {
    for (let s = s0; s < s1; s += 1.6) {
      if (r() < 0.35) continue;
      const i = Math.floor(track.wrapS(s) / track.spacing);
      const sideArr = side > 0 ? track.left : track.right;
      const d = side * (sideArr.wall[i] + 3 + r() * 6);
      const p = at(s, d);
      if (terrain.clearance(p[0], p[2]) < 1.5) continue;
      inst.add('spectator', Math.floor(r() * PROP_VARIANTS.spectator), p[0], terrain.heightAt(p[0], p[2]), p[2], yawFacingTrack(track, p[0], p[2]), 1, SHIRTS[Math.floor(r() * SHIRTS.length)]);
    }
  }
}

/** Track index where a mapped path crosses the centreline, or -1 when it does not cross it. */
function crossingIndex(track: Track, path: XZ[]): number {
  const tp = createTrackPoint();
  let prev: { d: number; s: number } | null = null;
  for (const [x, z] of path) {
    projectToTrack(track, x, z, -1, tp);
    const cur = { d: tp.d, s: tp.s };
    if (prev && Math.sign(prev.d) !== Math.sign(cur.d) && Math.abs(prev.d - cur.d) < 120 && Math.abs(track.wrapS(cur.s - prev.s + track.length / 2) - track.length / 2) < 30) {
      const f = prev.d / (prev.d - cur.d);
      return Math.round(track.wrapS(prev.s + (cur.s - prev.s) * f) / track.spacing) % track.n;
    }
    prev = cur;
  }
  return -1;
}
