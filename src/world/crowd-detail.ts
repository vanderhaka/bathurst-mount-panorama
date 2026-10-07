import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { PROPS_LOOK } from '@/props/look';
import { createRng } from '@/props/core/rng';
import { loftRings, quad, strut } from '@/props/core/shapes';
import { createDetailMotionMaterial } from '@/world/detail-motion';

export interface CrowdOptions { length: number; rows: number; density: number; roof: boolean; seed: number; maxTriangles: number }
export interface CrowdDetailOptions { enabled: boolean; density: number; motion: number }
export const CROWD_DETAIL_PRESETS = {
  low: { enabled: false, density: 0, motion: 0 },
  medium: { enabled: true, density: 0.65, motion: 0 },
  high: { enabled: true, density: 1, motion: 0.018 },
} as const;
export interface CrowdSeat {
  x: number; y: number; z: number; row: number; shirt: number; skin: number; hat: number | null;
  scale: number; pose: 'still' | 'lean' | 'cheer'; accessory: 'none' | 'flag' | 'umbrella'; phase: number;
}
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const triangleCount = (g: THREE.BufferGeometry) => (g.index?.count ?? g.getAttribute('position').count) / 3;

/** Same 0.5m seat pitch, 0.8m tread, 0.42m rise and 1.2m aisles as grandstand.ts. */
export function crowdSeats(options: CrowdOptions): CrowdSeat[] {
  const length = Math.max(6, Math.min(300, options.length)), rows = Math.max(1, Math.min(40, Math.round(options.rows)));
  const density = Math.max(0, Math.min(1, options.density));
  const random = createRng(options.seed), result: Array<{ seat: CrowdSeat; order: number }> = [];
  const blocks = Math.max(1, Math.round(length / 12)), aisle = 1.2, blockWidth = (length - aisle * (blocks + 1)) / blocks;
  const look = PROPS_LOOK;
  for (let row = 0; row < rows; row++) for (let block = 0; block < blocks; block++) {
    const start = -length / 2 + aisle + block * (blockWidth + aisle);
    for (let k = 0; k < Math.floor(blockWidth / 0.5); k++) {
      const order = random(); if (order > density) continue;
      const accessory = random();
      const shirt = random() < look.crowd.teamShare * 0.65 ? look.crowd.teams[(block * 7 + rows) % look.crowd.teams.length] : random.pick(look.people.shirts);
      result.push({ order, seat: {
        x: start + 0.5 * (k + 0.5), y: 1.4 + row * 0.42 + 0.42, z: rows * 0.4 - row * 0.8 - 0.36 + 0.02,
        row, shirt, skin: random.pick(look.people.skin), hat: random() < 0.3 ? random.pick(look.people.hats) : null,
        scale: random.range(0.88, 1.12), pose: random.pick(['still', 'lean', 'cheer'] as const),
        accessory: accessory < 0.045 ? 'flag' : accessory < 0.063 && !options.roof ? 'umbrella' : 'none', phase: random.range(0, Math.PI * 2),
      } });
    }
  }
  // A triangle-capped stand still fills all rows rather than cutting off its rear half.
  return result.sort((a, b) => a.order - b.order).map(p => p.seat);
}

function seatedFigure(seat: CrowdSeat): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (source: THREE.BufferGeometry, hex: number) => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const color = new THREE.Color(hex), count = geometry.getAttribute('position').count, colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); geometry.deleteAttribute('uv'); parts.push(geometry);
  };
  const ring = (y: number, width: number, depth: number) => [V(-width, y, -depth), V(width, y, -depth), V(width, y, depth), V(-width, y, depth)];
  add(loftRings([ring(0, 0.12, 0.085), ring(0.43, 0.18, 0.095)], { capEnd: true }), seat.shirt);
  add(new THREE.SphereGeometry(0.105, 6, 2).scale(0.9, 1.1, 1).translate(0, 0.56, 0.015), seat.skin);
  if (seat.hat !== null) add(new THREE.ConeGeometry(0.12, 0.075, 6).translate(0, 0.665, 0.015), seat.hat);
  if (seat.pose === 'cheer') add(strut(V(0.15, 0.38, 0), V(0.25, 0.64, 0.045), 0.045), seat.shirt);
  if (seat.accessory === 'flag') {
    add(strut(V(0.2, 0.36, 0.06), V(0.2, 1.07, 0.06), 0.008), TRACKSIDE.fencePost);
    add(quad(V(0.2, 1.02, 0.06), V(0.47, 0.99, 0.09), V(0.47, 0.83, 0.05), V(0.2, 0.85, 0.06)), seat.shirt);
  } else if (seat.accessory === 'umbrella') {
    add(strut(V(0.12, 0.12, -0.02), V(0.12, 1.1, -0.02), 0.009), TRACKSIDE.fencePost);
    const roof = new THREE.ConeGeometry(0.44, 0.2, 8, 1, true).translate(0.12, 1.02, -0.02);
    add(roof, seat.shirt); add(new THREE.ConeGeometry(0.445, 0.04, 8, 1, true).translate(0.12, 0.92, -0.02), BUILDING.white);
  }
  const geometry = mergeGeometries(parts)!; parts.forEach(p => p.dispose());
  geometry.scale(seat.scale, seat.scale, seat.scale);
  if (seat.pose === 'lean') geometry.rotateZ(0.09 * Math.sin(seat.phase));
  geometry.translate(seat.x, seat.y, seat.z);
  const positions = geometry.getAttribute('position'), motion = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const weight = Math.min(1, Math.max(0, (positions.getY(i) - seat.y) / 0.65));
    motion[i * 3] = weight * weight; motion[i * 3 + 1] = seat.phase; motion[i * 3 + 2] = 0.85 + seat.scale * 0.2;
  }
  geometry.setAttribute('detailMotion', new THREE.BufferAttribute(motion, 3));
  return geometry;
}

/** Pass 15000 minus the existing stand's triangle count as maxTriangles. */
export function buildCrowdDetail(options: CrowdOptions, settings: CrowdDetailOptions) {
  const allowed = Math.max(0, Math.min(15000, Math.floor(options.maxTriangles))), parts: THREE.BufferGeometry[] = [];
  let triangles = 0, people = 0;
  if (settings.enabled) for (const seat of crowdSeats({ ...options, density: options.density * Math.max(0, Math.min(1, settings.density)) })) {
    if (triangles + 24 > allowed) break;
    const figure = seatedFigure(seat), count = triangleCount(figure);
    if (triangles + count > allowed) { figure.dispose(); continue; }
    parts.push(figure); triangles += count; people++;
  }
  const geometry = parts.length ? mergeGeometries(parts)! : new THREE.BufferGeometry(); parts.forEach(p => p.dispose());
  if (!parts.length) for (const name of ['position', 'normal', 'color', 'detailMotion']) geometry.setAttribute(name, new THREE.Float32BufferAttribute([], 3));
  if (people) { geometry.computeBoundingBox(); geometry.boundingBox!.expandByScalar(0.08); geometry.computeBoundingSphere(); geometry.boundingSphere!.radius += 0.08; }
  const motion = createDetailMotionMaterial(settings.motion);
  const mesh = new THREE.Mesh(geometry, motion.material); mesh.name = 'grandstand-crowd-detail';
  mesh.receiveShadow = true; mesh.castShadow = false;
  let disposed = false;
  return {
    mesh, people, triangles, get motionAmplitude() { return motion.amplitude(); }, update: motion.update, setMotion: motion.setAmplitude,
    dispose: () => { if (!disposed) { disposed = true; geometry.dispose(); motion.material.dispose(); } },
  };
}
