import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import featuresJson from '@/track/data/features.json';
import { BUILDING } from '@/art/palette';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import { PROP_VARIANTS, structures } from '@/props';
import type { Track } from '@/track/track-model';
import type { Terrain } from '@/world/terrain';
import { centroid, orientedBox, polygonArea, rng, type SpatialMask, type XZ } from '@/world/scenery/geo';
import type { PropInstancer } from '@/world/scenery/instancer';

interface OsmBuilding { kind: string; name: string | null; levels: number | null; poly: XZ[] }
const F = featuresJson as unknown as { buildings: OsmBuilding[] };

const WALLS = [BUILDING.white, BUILDING.offWhite, BUILDING.grey, BUILDING.brick, BUILDING.colorbondGreen].map(linearColour);
const ROOFS = [BUILDING.roof, BUILDING.roofRed, BUILDING.darkGrey, BUILDING.colorbondGreen].map(linearColour);

/** True for the long building next to the pit lane (the pit and race-control complex). */
/** Centre, facing (towards the track) and size of the pit complex, for the paddock behind it. */
export function pitComplexPlacement(track: Track): { cx: number; cz: number; yaw: number; length: number; width: number } | null {
  const b = F.buildings.find((x) => isPitComplex(x, track));
  if (!b) return null;
  const box = orientedBox(b.poly);
  return { cx: box.cx, cz: box.cz, yaw: faceTrack(track, box), length: box.length, width: box.width };
}

function isPitComplex(b: OsmBuilding, track: Track): boolean {
  if (polygonArea(b.poly) < 2500) return false;
  const [cx, cz] = centroid(b.poly);
  const i = track.nearestIndex(cx, cz);
  const s = i * track.spacing;
  return s > 60 && s < 440 && Math.hypot(track.px[i] - cx, track.pz[i] - cz) < 60;
}

/**
 * Real building footprints from OpenStreetMap: houses become house props fitted
 * to the footprint, grandstands and the pit complex become structures, and all
 * other buildings are extruded from their outline (merged into one mesh).
 */
export function placeBuildings(track: Track, terrain: Terrain, inst: PropInstancer, mask: SpatialMask): THREE.Group {
  const group = new THREE.Group();
  group.name = 'buildings';
  const r = rng(77);
  const extruded: THREE.BufferGeometry[] = [];
  for (const b of F.buildings) {
    const box = orientedBox(b.poly);
    const [cx, cz] = [box.cx, box.cz];
    mask.add(cx, cz, Math.max(box.length, box.width) * 0.6 + 2);
    const ground = minGround(terrain, b.poly);
    if (isPitComplex(b, track)) {
      group.add(placeStructure(structures.pitBuilding({ length: Math.round(box.length), garages: 36 }), cx, ground, cz, faceTrack(track, box)));
      continue;
    }
    if (b.kind === 'grandstand') {
      const stand = structures.grandstand({ length: Math.max(12, Math.round(box.length)), rows: Math.max(6, Math.round(box.width / 0.8)), roof: !/no cover/i.test(b.name ?? ''), crowd: 0.65 });
      group.add(placeStructure(stand, cx, ground, cz, faceTrack(track, box)));
      continue;
    }
    if (b.name === 'Control Tower') {
      group.add(placeStructure(structures.controlTower({ height: 9 }), cx, ground, cz, faceTrack(track, box)));
      continue;
    }
    // Tiny unnamed footprints right at the track (signal huts, kiosks) are not houses.
    const nearTrack = terrain.clearance(cx, cz) < 3;
    if (b.kind === 'generic' && !b.name && (polygonArea(b.poly) < 15 || nearTrack)) {
      if (!nearTrack) inst.add('shed', Math.floor(r() * PROP_VARIANTS.shed), cx, ground, cz, Math.PI / 2 - box.angle, 0.7);
      continue;
    }
    if (b.kind === 'house' || (b.kind === 'generic' && polygonArea(b.poly) < 260 && !b.name)) {
      const scale = Math.max(0.6, Math.min(1.6, Math.sqrt((box.length * box.width) / 140)));
      inst.add('house', Math.floor(r() * PROP_VARIANTS.house), cx, ground, cz, Math.PI / 2 - box.angle, scale);
      continue;
    }
    // Mapped marshal-point shelters: the marshalPost prop stands there (facilities.ts).
    if (b.kind === 'shelter' && /marshal/i.test(b.name ?? '')) continue;
    if (b.kind === 'shed') {
      inst.add('shed', Math.floor(r() * PROP_VARIANTS.shed), cx, ground, cz, Math.PI / 2 - box.angle, 1);
      continue;
    }
    extruded.push(extrudeFootprint(b, ground, r));
  }
  if (extruded.length) {
    const mesh = new THREE.Mesh(mergeGeometries(extruded), vertexColourMaterial({ roughness: 0.85, flat: true }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = 'osm-buildings';
    group.add(mesh);
  }
  return group;
}

function minGround(terrain: Terrain, poly: XZ[]): number {
  let h = Infinity;
  for (const [x, z] of poly) h = Math.min(h, terrain.heightAt(x, z));
  return h;
}

/** Yaw that turns a box so that its +Z side faces the nearest track point. */
function faceTrack(track: Track, box: { cx: number; cz: number; angle: number }): number {
  const i = track.nearestIndex(box.cx, box.cz);
  const toTrack = Math.atan2(track.px[i] - box.cx, track.pz[i] - box.cz);
  // The long axis of the box is along `angle` (from +X); the facing must be perpendicular to it.
  const a1 = Math.PI / 2 - box.angle + Math.PI / 2, a2 = a1 + Math.PI;
  const diff = (a: number) => Math.abs(Math.atan2(Math.sin(a - toTrack), Math.cos(a - toTrack)));
  return diff(a1) < diff(a2) ? a1 : a2;
}

function placeStructure(obj: THREE.Object3D, x: number, y: number, z: number, yaw: number): THREE.Object3D {
  obj.position.set(x, y, z);
  obj.rotation.y = yaw;
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return obj;
}

function extrudeFootprint(b: OsmBuilding, ground: number, r: () => number): THREE.BufferGeometry {
  const pts = b.poly.slice(0, -1);
  // Shape in the x/-z plane, extruded along +Z then rotated so that +Z becomes +Y.
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const levels = b.levels ?? (polygonArea(b.poly) > 1500 ? 2 : 1);
  const height = levels * 3.3 + 0.6;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height + 1.5, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, ground - 1.5, 0);
  const wall = WALLS[Math.floor(r() * WALLS.length)], roof = ROOFS[Math.floor(r() * ROOFS.length)];
  const pos = geo.getAttribute('position');
  const nrm = (geo.computeVertexNormals(), geo.getAttribute('normal'));
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = nrm.getY(i) > 0.7 ? roof : wall;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return mergeGeometries([geo, facade(pts, ground, levels, height, wall)]);
}

const GLASS = linearColour(BUILDING.glass);
const FASCIA = linearColour(BUILDING.darkGrey);

/** Window rows per storey, a darker plinth and a roof fascia on every wall, just outside the wall face. */
function facade(pts: XZ[], ground: number, levels: number, height: number, wall: THREE.Color): THREE.BufferGeometry {
  const q = new QuadSink();
  const plinth = wall.clone().multiplyScalar(0.62);
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    area2 += ax * bz - bx * az;
  }
  const sign = area2 > 0 ? 1 : -1;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 2.5) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    const nx = sign * uz, nz = -sign * ux; // outward normal
    const along = (t0: number, t1: number, y0: number, y1: number, off: number, c: THREE.Color) =>
      q.quad(ax + ux * t0 + nx * off, az + uz * t0 + nz * off, ax + ux * t1 + nx * off, az + uz * t1 + nz * off, y0, y1, nx, nz, c);
    along(0, len, ground - 0.3, ground + 0.45, 0.06, plinth);
    along(0, len, ground + height - 0.45, ground + height + 0.02, 0.1, FASCIA);
    const count = Math.floor((len - 1.6) / 2.7);
    const start = (len - (count * 2.7 - 1.1)) / 2;
    for (let k = 0; k < levels; k++) {
      const y0 = ground + k * 3.3 + 1.0;
      for (let w = 0; w < count; w++) along(start + w * 2.7, start + w * 2.7 + 1.6, y0, y0 + 1.25, 0.08, GLASS);
    }
  }
  return q.build();
}

/** Collects outward-facing vertical quads as a non-indexed geometry with normals and colours. */
class QuadSink {
  private readonly p: number[] = [];
  private readonly n: number[] = [];
  private readonly c: number[] = [];

  quad(ax: number, az: number, bx: number, bz: number, y0: number, y1: number, nx: number, nz: number, col: THREE.Color): void {
    // Counter-clockwise seen from outside: a-low, b-high, b-low and a-low, a-high, b-high.
    const v = [ax, y0, az, bx, y1, bz, bx, y0, bz, ax, y0, az, ax, y1, az, bx, y1, bz];
    const flip = (bx - ax) * nz - (bz - az) * nx > 0; // keep the front face outward for either edge direction
    for (let t = 0; t < 2; t++) {
      const tri = flip ? [0, 2, 1] : [0, 1, 2];
      for (const k of tri) {
        const o = (t * 3 + k) * 3;
        this.p.push(v[o], v[o + 1], v[o + 2]);
        this.n.push(nx, 0, nz);
        this.c.push(col.r, col.g, col.b);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}
