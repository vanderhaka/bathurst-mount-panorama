import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import type { Mesher } from '@/props/core/mesher';
import { createRng } from '@/props/core/rng';
import { extrude, loftRings, quad } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import { StructureParts, stairFlight, V } from '@/props/structures/parts';

// Covered grandstand along X facing +Z: stepped concrete terrace (extruded
// profile), seat blocks between aisles, front fascia with rail, back wall,
// cantilevered roof on columns, and an optional merged crowd.

const TREAD = 0.8;
const RISE = 0.42;
const FRONT_H = 1.4;
const SEAT_PITCH = 0.5;
/** Depth of the raked slab under the treads. */
const SLAB = 0.55;

/** Simple seated crowd figure (~14 tris): tapered torso + pyramid head. */
function crowdFigure(m: Mesher, x: number, y: number, z: number, shirt: THREE.Color, head: THREE.Color, s: number): void {
  const ring = (yy: number, hw: number, hd: number) => [V(x - hw, yy, z + hd), V(x + hw, yy, z + hd), V(x + hw, yy, z - hd), V(x - hw, yy, z - hd)];
  m.add(loftRings([ring(y, 0.2 * s, 0.14), ring(y + 0.62 * s, 0.17 * s, 0.1)], { capEnd: true }), shirt);
  const hy = y + 0.62 * s;
  const tip = V(x, hy + 0.27 * s, z);
  const base = [V(x - 0.09, hy + 0.04, z + 0.09), V(x + 0.09, hy + 0.04, z + 0.09), V(x + 0.09, hy + 0.04, z - 0.09), V(x - 0.09, hy + 0.04, z - 0.09)];
  m.add(loftRings([base, [tip, tip, tip, tip]]), head);
}

export function buildGrandstand(opts: { length: number; rows: number; roof: boolean; crowd: number }): THREE.Group {
  const L = Math.max(6, opts.length);
  const rows = Math.max(1, Math.round(opts.rows));
  const p = new StructureParts();
  const depth = rows * TREAD;
  const zFront = depth / 2;
  const topY = FRONT_H + rows * RISE;

  // Raked terrace: a stepped concrete slab (stepped top, straight soffit) carried on
  // raker columns, open underneath, with a low front wall. Profile in (z, y), extruded along X.
  const zBack = -zFront - 0.3;
  const soffit = (z: number) => FRONT_H - SLAB + ((topY - SLAB * 1.6 - (FRONT_H - SLAB)) * (zFront - z)) / (zFront - zBack);
  const outline: Array<[number, number]> = [[zFront, FRONT_H - SLAB], [zFront, FRONT_H]];
  for (let r = 0; r < rows; r++) {
    const z = zFront - r * TREAD;
    const y = FRONT_H + r * RISE;
    outline.push([z - TREAD, y], [z - TREAD, y + RISE]);
  }
  outline.push([zBack, topY], [zBack, soffit(zBack)]);
  // extrude() works in (x, y) and extrudes along +Z: map profile z → shape x, then rotate.
  const terrace = extrude(outline.map(([z, y]) => [-z, y] as [number, number]), L).translate(0, 0, -L / 2).rotateY(Math.PI / 2);
  p.base.add(terrace, (f) => (f.normal.y > 0.9 ? TRACKSIDE.concrete : TRACKSIDE.concreteDark), { jitter: 0.015 });
  p.block(L, FRONT_H - SLAB, 0.25, 0, 0, zFront - 0.125, TRACKSIDE.concreteDark);
  const frames = Math.max(2, Math.round(L / 6) + 1);
  for (let i = 0; i < frames; i++) {
    const x = -L / 2 + 0.4 + ((L - 0.8) * i) / (frames - 1);
    for (const t of [0.36, 0.7]) {
      const z = zFront - (zFront - zBack) * t;
      p.block(0.35, soffit(z), 0.35, x, 0, z, TRACKSIDE.concreteDark);
    }
  }

  // Seat blocks between aisles; seat backs in the club colour, alternating blocks.
  const aisle = 1.2;
  const blocks = Math.max(1, Math.round(L / 12));
  const blockW = (L - aisle * (blocks + 1)) / blocks;
  const seatCols = [BUILDING.accentBlue, BUILDING.white];
  const seats: Array<[number, number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const z = zFront - r * TREAD - TREAD * 0.45;
    const y = FRONT_H + r * RISE;
    for (let b = 0; b < blocks; b++) {
      const x = -L / 2 + aisle + b * (blockW + aisle) + blockW / 2;
      const col = seatCols[(b + (r > rows / 2 ? 1 : 0)) % 2];
      p.block(blockW, 0.06, 0.42, x, y + 0.4, z + 0.08, col);
      p.block(blockW, 0.42, 0.06, x, y + 0.42, z - 0.16, col);
      for (let k = 0; k < Math.floor(blockW / SEAT_PITCH); k++) seats.push([x - blockW / 2 + SEAT_PITCH * (k + 0.5), y + 0.42, z + 0.02]);
    }
  }
  // Front rail and the sponsor-panel fascia along the front wall.
  p.beam(V(-L / 2, FRONT_H + 1.0, zFront - 0.1), V(L / 2, FRONT_H + 1.0, zFront - 0.1), 0.03, TRACKSIDE.armco);
  addFrontFascia(p, L, zFront);
  const wallH = opts.roof ? 3.4 : 1.4;
  // Back wall: grey cladding on darker columns with a club-colour band.
  p.block(L + 0.4, topY + wallH, 0.3, 0, 0, -zFront - 0.45, BUILDING.grey, 0.01);
  for (let x = -L / 2; x <= L / 2 + 0.01; x += L / Math.max(1, Math.round(L / 5))) p.block(0.35, topY + wallH, 0.2, x, 0, -zFront - 0.7, BUILDING.darkGrey);
  p.block(L + 0.4, 0.45, 0.06, 0, topY + wallH - 1.1, -zFront - 0.83, BUILDING.accentBlue);
  addEndWalls(p, L, rows, zFront, topY);
  addRearAccess(p, L, zFront, topY);

  if (opts.roof) addRoof(p, L, zFront, topY + wallH);

  // Crowd: occupancy fraction (0..1) or a head count (> 1).
  const want = opts.crowd <= 1 ? Math.round(seats.length * Math.max(0, opts.crowd)) : Math.min(seats.length, Math.round(opts.crowd));
  if (want > 0) {
    const rng = createRng(rows * 31 + Math.round(L));
    const look = PROPS_LOOK;
    const order = seats.map((s, i) => ({ s, k: rng() + (i % 7 === 0 ? 0.5 : 0) })).sort((a, b) => a.k - b.k);
    for (let i = 0; i < want; i++) {
      const [x, y, z] = order[i].s;
      // Fans sit together: each ~12 m seat block has a main team colour.
      const team = look.crowd.teams[(Math.floor((x + L / 2) / 12) * 7 + rows) % look.crowd.teams.length];
      const shirtHex = rng() < look.crowd.teamShare ? team : rng.pick(look.crowd.shirts);
      const shirt = new THREE.Color().setHex(shirtHex).multiplyScalar(1 + rng.jitter(look.crowd.jitter));
      const head = new THREE.Color().setHex(rng() < 0.3 ? rng.pick(look.people.hats) : rng.pick(look.people.hair));
      crowdFigure(p.base, x + rng.jitter(0.06), y, z, shirt, head, 0.92 + rng() * 0.16);
    }
  }
  return p.toGroup('grandstand');
}

/** Sponsor panels on the front wall: plain colour boards with an abstract stripe (no text). */
function addFrontFascia(p: StructureParts, L: number, zFront: number): void {
  const colours = PROPS_LOOK.grandstand.fascia;
  const n = Math.max(2, Math.round(L / 6.5));
  const w = L / n;
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + w * (i + 0.5);
    const c = colours[i % colours.length];
    const stripe = c === BUILDING.white ? BUILDING.accentRed : BUILDING.white;
    p.block(w - 0.25, FRONT_H - 0.35, 0.05, x, 0.2, zFront + 0.03, c);
    p.block((w - 0.25) * 0.55, 0.16, 0.06, x - w * 0.1, 0.2 + (FRONT_H - 0.35) * 0.36, zFront + 0.04, stripe);
  }
}

/** End walls: a coarse stepped silhouette (one step per 3 rows) over the slab end, open below. */
function addEndWalls(p: StructureParts, L: number, rows: number, zFront: number, topY: number): void {
  const rail = 1.0;
  const per = rows > 8 ? 3 : 2;
  const zBack = -zFront - 0.3;
  const profile: Array<[number, number]> = [[zFront, FRONT_H - SLAB], [zFront, FRONT_H + rail]];
  for (let r = per; r < rows; r += per) {
    const z = zFront - r * TREAD;
    profile.push([z, FRONT_H + (r - per) * RISE + rail + RISE], [z, FRONT_H + r * RISE + rail]);
  }
  profile.push([zBack, FRONT_H + (rows - 1) * RISE + rail + RISE], [zBack, topY - SLAB * 1.6]);
  for (const s of [-1, 1]) {
    const end = extrude(profile.map(([z, y]) => [-z, y] as [number, number]), 0.3).translate(0, 0, -0.15).rotateY(Math.PI / 2).translate(s * (L / 2 + 0.15), 0, 0);
    p.base.add(end, (f) => (f.normal.y > 0.9 ? TRACKSIDE.concreteDark : BUILDING.offWhite), { jitter: 0.01 });
  }
}

/** Stair flights up the back wall to doorways at the top row, and entry doors at ground level. */
function addRearAccess(p: StructureParts, L: number, zFront: number, topY: number): void {
  const zWall = -zFront - 0.6;
  const zStair = zWall - 1.0;
  const flights = L >= 30 ? 2 : 1;
  const door = (x: number, y0: number, h: number, w: number) => p.glass.add(quad(V(x + w / 2, y0, zWall - 0.01), V(x - w / 2, y0, zWall - 0.01), V(x - w / 2, y0 + h, zWall - 0.01), V(x + w / 2, y0 + h, zWall - 0.01)), BUILDING.darkGrey);
  for (let f = 0; f < flights; f++) {
    const side = flights === 1 ? 1 : f === 0 ? -1 : 1;
    const xTop = side * (L * (flights === 1 ? 0.15 : 0.22));
    // Landing at the top, then the flight runs down towards the stand's centre.
    p.block(2.4, 0.3, 1.8, xTop + side * 1.0, topY - 0.3, zStair, BUILDING.grey);
    stairFlight(p, xTop, (-side) as 1 | -1, topY, zStair, 1.6);
    door(xTop + side * 1.0, topY, 2.2, 1.6);
  }
  // Ground-level vomitory entrances along the back.
  const entries = Math.max(2, Math.round(L / 14));
  for (let i = 0; i < entries; i++) door(-L / 2 + (L * (i + 0.5)) / entries, 0, 2.4, 2.2);
}

/** Cantilever roof sheet on front columns, steel trusses under it and a deep fascia band. */
function addRoof(p: StructureParts, L: number, zFront: number, roofBack: number): void {
  const roofFront = roofBack + 0.6;
  const zEdge = zFront + 1.0;
  const zBack = -zFront - 0.6;
  const hx = L / 2 + 0.6;
  const t = 0.25;
  const ring = (x: number) => [V(x, roofBack - t, zBack), V(x, roofBack, zBack), V(x, roofFront, zEdge), V(x, roofFront - t, zEdge)]; // counter-clockwise about +X
  p.base.add(loftRings([ring(-hx), ring(hx)], { capStart: true, capEnd: true }), (f) => (f.normal.y < -0.5 ? BUILDING.grey : BUILDING.roof));
  const yAt = (z: number) => roofBack - t + ((roofFront - roofBack) * (z - zBack)) / (zEdge - zBack);
  const cols = Math.max(2, Math.round(L / 10) + 1);
  const zc = zFront - TREAD * 0.2;
  for (let i = 0; i < cols; i++) {
    const x = -L / 2 + (i * L) / (cols - 1);
    p.beam(V(x, FRONT_H, zc), V(x, yAt(zc), zc), 0.12, BUILDING.white, 6);
    // Truss: bottom chord from the back wall to the front column, zig-zag web up to the roof.
    const chordY = (z: number) => yAt(z) - 1.1 * (1 - Math.abs(z - (zBack + zc) / 2) / ((zc - zBack) / 2)) - 0.15;
    const nodes = 5;
    let prev = V(x, yAt(zBack), zBack + 0.1);
    for (let k = 1; k <= nodes; k++) {
      const z = zBack + ((zc - zBack) * k) / nodes;
      const low = V(x, chordY(z), z);
      const high = V(x, yAt(z), z);
      p.beam(prev, k % 2 ? low : high, 0.05, BUILDING.white);
      if (k % 2) p.beam(V(x, chordY(z - (zc - zBack) / nodes), z - (zc - zBack) / nodes), low, 0.06, BUILDING.white);
      prev = k % 2 ? low : high;
    }
  }
  // Fascia band along the front edge (club colour with a white stripe) and a back purlin band.
  p.block(L + 1.2, 0.9, 0.12, 0, roofFront - 0.95, zEdge + 0.05, PROPS_LOOK.grandstand.roofBand);
  p.block(L + 1.21, 0.14, 0.13, 0, roofFront - 0.55, zEdge + 0.05, BUILDING.white);
  p.block(L + 0.6, 0.35, 0.2, 0, roofBack - t - 0.35, zBack + 0.15, BUILDING.white);
}
