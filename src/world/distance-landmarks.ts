import * as THREE from 'three';
import { BUILDING, FOLIAGE, GROUND } from '@/art/palette';
import { createRng } from '@/props/core/rng';
import { DEM_EXTENT, fbm } from '@/world/dem';
import { TOWN } from '@/world/terrain';

export interface DistanceGround { heightAt(x: number, z: number): number; box: { x0: number; z0: number; x1: number; z1: number } }
export interface DistanceDetailOptions { enabled: boolean; town: boolean; plains: boolean; maxHouses: number; fieldCount: number; hillStrength: number }
export const DISTANCE_DETAIL_PRESETS = {
  low: { enabled: false, town: false, plains: false, maxHouses: 0, fieldCount: 0, hillStrength: 0 },
  medium: { enabled: true, town: true, plains: false, maxHouses: 500, fieldCount: 0, hillStrength: 0.04 },
  high: { enabled: true, town: true, plains: true, maxHouses: 1500, fieldCount: 36, hillStrength: 0.08 },
} as const;
export const BATHURST_TOWN = { x: TOWN.x, z: TOWN.z, radius: TOWN.r } as const;
export interface TownHouse { x: number; y: number; z: number; yaw: number; width: number; depth: number; height: number; roofHeight: number; wall: number; roof: number }
const ANGLE = 0.38, BLOCK_U = 100, BLOCK_V = 80;
const WALLS = [BUILDING.brick, BUILDING.offWhite, BUILDING.white];
const ROOFS = [BUILDING.roofRed, BUILDING.roof, BUILDING.darkGrey, BUILDING.colorbondGreen];
const outOfCircuit = (g: DistanceGround, x: number, z: number, margin: number) => x < g.box.x0 - margin || x > g.box.x1 + margin || z < g.box.z0 - margin || z > g.box.z1 + margin;
const insideDem = (x: number, z: number, margin: number) => Math.abs(x - DEM_EXTENT.far.cx) < DEM_EXTENT.far.size / 2 - margin && Math.abs(z - DEM_EXTENT.far.cz) < DEM_EXTENT.far.size / 2 - margin;

/** Same Bathurst centre/grid as the original town, with unique lots and a fixed population ceiling. */
export function distanceTownLayout(ground: DistanceGround, options: DistanceDetailOptions): TownHouse[] {
  if (!options.enabled || !options.town) return [];
  const random = createRng(1815), houses: Array<{ p: TownHouse; order: number }> = [];
  const n = Math.ceil(TOWN.r / 18), blocks = Math.ceil(TOWN.r / BLOCK_V), c = Math.cos(ANGLE), s = Math.sin(ANGLE);
  for (let i = -n; i <= n; i++) for (let j = -blocks; j <= blocks; j++) for (const verge of [-14, 14]) {
    const u = i * 18, v = j * BLOCK_V + verge;
    const street = Math.abs(u - Math.round(u / BLOCK_U) * BLOCK_U);
    if (street < 14) continue;
    const x = TOWN.x + u * c - v * s, z = TOWN.z + u * s + v * c;
    const radial = Math.hypot(x - TOWN.x, z - TOWN.z) / TOWN.r;
    if (radial >= 1 || !outOfCircuit(ground, x, z, 60) || !insideDem(x, z, 60)) continue;
    if (random() > (1 - radial * radial) * 0.48 || fbm(x / 260, z / 260, 2, 77) > 0.38) continue;
    const big = radial < 0.25 && random() < 0.3;
    houses.push({ order: random(), p: {
      x, y: ground.heightAt(x, z), z, yaw: ANGLE, width: big ? random.range(18, 28) : random.range(9, 14),
      depth: big ? random.range(12, 20) : random.range(8, 12), height: big ? random.range(5, 10) : random.range(2.7, 3.5),
      roofHeight: big ? 0.6 : random.range(1.6, 2.2), wall: random.pick(WALLS), roof: random.pick(ROOFS),
    } });
  }
  return houses.sort((a, b) => a.order - b.order).slice(0, Math.max(0, Math.min(2000, Math.floor(options.maxHouses)))).map(h => h.p);
}

interface Buffers { positions: number[]; colors: number[] }
type Point = [number, number, number];
function triangle(buffers: Buffers, a: Point, b: Point, c: Point, color: THREE.Color): void {
  buffers.positions.push(...a, ...b, ...c);
  for (let k = 0; k < 3; k++) buffers.colors.push(color.r, color.g, color.b);
}
function house(buffers: Buffers, h: TownHouse): void {
  const c = Math.cos(h.yaw), s = Math.sin(h.yaw), a = h.width / 2, b = h.depth / 2;
  const point = (x: number, z: number, y: number): Point => [h.x + x * c - z * s, y, h.z + x * s + z * c];
  const base = [point(-a, -b, h.y - 0.8), point(a, -b, h.y - 0.8), point(a, b, h.y - 0.8), point(-a, b, h.y - 0.8)];
  const top = base.map(p => [p[0], h.y + h.height, p[2]] as Point);
  const ridge = [point(-a + b * 0.7, 0, h.y + h.height + h.roofHeight), point(a - b * 0.7, 0, h.y + h.height + h.roofHeight)];
  const wall = new THREE.Color(h.wall), roof = new THREE.Color(h.roof);
  for (let k = 0; k < 4; k++) {
    const next = (k + 1) % 4;
    triangle(buffers, base[k], top[next], base[next], wall); triangle(buffers, base[k], top[k], top[next], wall);
  }
  triangle(buffers, top[0], ridge[0], ridge[1], roof); triangle(buffers, top[0], ridge[1], top[1], roof);
  triangle(buffers, top[2], ridge[1], ridge[0], roof); triangle(buffers, top[2], ridge[0], top[3], roof);
  triangle(buffers, top[1], ridge[1], top[2], roof); triangle(buffers, top[3], ridge[0], top[0], roof);
}

/** Far hedgerows give the plains depth without coplanar field overlays or fabricated hills. */
function plainHedgerows(ground: DistanceGround, count: number): Buffers {
  const buffers: Buffers = { positions: [], colors: [] }, random = createRng(247);
  const foliage = new THREE.Color(FOLIAGE.eucalyptGreyGreen), trunk = new THREE.Color(GROUND.rock);
  for (let row = 0; row < Math.min(64, Math.max(0, Math.floor(count))); row++) {
    const theta = random.range(0, Math.PI * 2), radius = random.range(TOWN.r + 280, TOWN.r + 1600);
    const cx = TOWN.x + Math.cos(theta) * radius, cz = TOWN.z + Math.sin(theta) * radius;
    if (!outOfCircuit(ground, cx, cz, 380) || !insideDem(cx, cz, 350)) continue;
    for (let tree = 0; tree < 6; tree++) {
      const along = (tree - 2.5) * 32, x = cx + Math.cos(ANGLE) * along, z = cz + Math.sin(ANGLE) * along;
      const y = ground.heightAt(x, z), height = random.range(8, 14), width = random.range(3.5, 6);
      for (const axis of [0, Math.PI / 2]) {
        const point = (u: number, v: number): Point => [x + Math.cos(axis) * u, y + v, z + Math.sin(axis) * u];
        const center = point(0, height * 0.72), ring: Point[] = [];
        for (let k = 0; k < 8; k++) {
          const a = k / 8 * Math.PI * 2;
          ring.push(point(Math.cos(a) * width, height * 0.72 + Math.sin(a) * height * 0.28));
        }
        for (let k = 0; k < 8; k++) triangle(buffers, center, ring[k], ring[(k + 1) % 8], foliage);
        const left = point(-0.2, 0), right = point(0.2, 0), leftTop = point(-0.13, height * 0.6), rightTop = point(0.13, height * 0.6);
        triangle(buffers, left, right, rightTop, trunk); triangle(buffers, left, rightTop, leftTop, trunk);
      }
    }
  }
  return buffers;
}

/** Replace the existing buildTown result, retaining the real coarse DEM hill mesh. */
export function buildDistanceLandmarks(ground: DistanceGround, options: DistanceDetailOptions) {
  const group = new THREE.Group(); group.name = 'distance-landmarks';
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.98, side: THREE.DoubleSide, fog: true });
  const geometries: THREE.BufferGeometry[] = [], town: Buffers = { positions: [], colors: [] };
  for (const h of distanceTownLayout(ground, options)) house(town, h);
  let triangles = 0;
  const add = (name: string, buffers: Buffers) => {
    if (!buffers.positions.length) return;
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffers.colors, 3)); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.castShadow = false; mesh.receiveShadow = false;
    triangles += buffers.positions.length / 9; group.add(mesh); geometries.push(geometry);
  };
  add('bathurst-roof-silhouettes', town);
  if (options.enabled && options.plains) add('plain-hedgerows', plainHedgerows(ground, options.fieldCount));
  let disposed = false;
  return { group, triangles, dispose: () => { if (!disposed) { disposed = true; geometries.forEach(g => g.dispose()); material.dispose(); } } };
}

/** Apply once to fresh coarse geometry; rebuild for another strength. DEM silhouette and baked AO ratios stay unchanged. */
export function refineDistantHills(geometry: THREE.BufferGeometry, heightAt: (x: number, z: number) => number, strength: number): void {
  const position = geometry.getAttribute('position'), normals = new Float32Array(position.count * 3);
  const colors = geometry.getAttribute('color'), normal = new THREE.Vector3(), amount = Math.max(0, Math.min(0.15, strength));
  const epsilon = 30;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    const dx = (heightAt(x + epsilon, z) - heightAt(x - epsilon, z)) / (epsilon * 2);
    const dz = (heightAt(x, z + epsilon) - heightAt(x, z - epsilon)) / (epsilon * 2);
    normal.set(-dx, 1, -dz).normalize(); normal.toArray(normals, i * 3);
    if (colors) {
      const factor = 1 + fbm(x / 360, z / 360, 2, 247) * amount;
      colors.setXYZ(i, colors.getX(i) * factor, colors.getY(i) * factor, colors.getZ(i) * factor);
    }
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  if (colors) colors.needsUpdate = true;
}
