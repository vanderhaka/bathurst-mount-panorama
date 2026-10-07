import * as THREE from 'three';
import { BUILDING } from '@/art/palette';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import { fbm } from '@/world/dem';
import { rng } from '@/world/scenery/geo';
import { TOWN, type Terrain } from '@/world/terrain';

/** Street grid of the town: block size (m) and the grid angle (Bathurst's grid runs NE-SW). */
const BLOCK_U = 100, BLOCK_W = 80, ANGLE = 0.38;
const WALLS = [BUILDING.brick, BUILDING.offWhite, BUILDING.white, 0xc9b49a, 0xb07a5a].map(linearColour);
const ROOFS = [BUILDING.roofRed, BUILDING.roof, BUILDING.darkGrey, BUILDING.colorbondGreen, 0x8c3a2c].map(linearColour);

/**
 * The town of Bathurst seen from the mountain: low houses with hip roofs along a
 * street grid, denser and larger towards the centre. One merged, flat-shaded mesh
 * outside the detailed terrain area (about 12 triangles per building).
 */
export function buildTown(terrain: Terrain): THREE.Mesh {
  const r = rng(1815);
  const pos: number[] = [], col: number[] = [];
  const ca = Math.cos(ANGLE), sa = Math.sin(ANGLE);
  const { x0, z0, x1, z1 } = terrain.box;
  const n = Math.ceil(TOWN.r / 9);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      // Lots along the streets: every 18 m along u, two rows per block across w.
      const u = i * 18, w = Math.round((j * 18) / BLOCK_W) * BLOCK_W + (j % 2 === 0 ? -14 : 14);
      if (Math.abs((u % BLOCK_U) + BLOCK_U) % BLOCK_U < 14) continue; // cross streets
      const x = TOWN.x + u * ca - w * sa, z = TOWN.z + u * sa + w * ca;
      const d = Math.hypot(x - TOWN.x, z - TOWN.z) / TOWN.r;
      if (d > 1 || (x > x0 - 60 && x < x1 + 60 && z > z0 - 60 && z < z1 + 60)) continue;
      // Denser in the centre, ragged at the edge, with parks.
      if (r() > (1 - d * d) * 0.3 || fbm(x / 260, z / 260, 2, 77) > 0.38) continue;
      const big = d < 0.25 && r() < 0.35;
      const len = big ? 18 + r() * 14 : 9 + r() * 5, dep = big ? 14 + r() * 10 : 8 + r() * 4;
      const hgt = big ? 5 + r() * 5 : 3;
      const y = terrain.heightAt(x, z) - 0.8;
      house(pos, col, x, y, z, ANGLE + (r() < 0.5 ? 0 : Math.PI / 2), len, dep, hgt, big ? 0.6 : 2.2, WALLS[Math.floor(r() * WALLS.length)], ROOFS[Math.floor(r() * ROOFS.length)]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, vertexColourMaterial({ roughness: 0.9, flat: true, side: THREE.DoubleSide }));
  mesh.name = 'town';
  mesh.receiveShadow = false;
  return mesh;
}

/** A box with a hip roof (4 walls + 4 roof faces, 12 triangles), yaw about the centre. */
function house(pos: number[], col: number[], cx: number, y0: number, cz: number, yaw: number, len: number, dep: number, h: number, roofH: number, wall: THREE.Color, roof: THREE.Color): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const p = (a: number, b: number, y: number): number[] => [cx + a * c - b * s, y, cz + a * s + b * c];
  const hl = len / 2, hd = dep / 2, top = y0 + 0.8 + h;
  const base = [p(-hl, -hd, y0), p(hl, -hd, y0), p(hl, hd, y0), p(-hl, hd, y0)];
  const eave = [p(-hl, -hd, top), p(hl, -hd, top), p(hl, hd, top), p(-hl, hd, top)];
  const ridge = [p(-hl + hd * 0.8, 0, top + roofH), p(hl - hd * 0.8, 0, top + roofH)];
  const tri = (a: number[], b: number[], d: number[], k: THREE.Color) => { pos.push(...a, ...b, ...d); for (let q = 0; q < 3; q++) col.push(k.r, k.g, k.b); };
  for (let k = 0; k < 4; k++) {
    const a = base[k], b = base[(k + 1) % 4], ea = eave[k], eb = eave[(k + 1) % 4];
    tri(a, eb, b, wall);
    tri(a, ea, eb, wall);
  }
  tri(eave[0], ridge[0], ridge[1], roof); tri(eave[0], ridge[1], eave[1], roof);
  tri(eave[2], ridge[1], ridge[0], roof); tri(eave[2], ridge[0], eave[3], roof);
  tri(eave[1], ridge[1], eave[2], roof); tri(eave[3], ridge[0], eave[0], roof);
}
