import * as THREE from 'three';
import featuresJson from '@/track/data/features.json';
import { ROAD } from '@/art/palette';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import type { Track } from '@/track/track-model';
import { heightAt, createTrackPoint, projectToTrack } from '@/track/track-query';
import type { Terrain } from '@/world/terrain';
import type { XZ } from '@/world/scenery/geo';

const F = featuresJson as unknown as { stoneSign: XZ[][]; pitLane: XZ[][] };

/**
 * The white-stone "MOUNT PANORAMA" sign on the hillside below Skyline, built from
 * its real OpenStreetMap letter outlines and draped onto the terrain.
 */
export function buildStoneSign(terrain: Terrain): THREE.Mesh | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const ring of F.stoneSign) {
    if (ring.length < 4) continue;
    const closed = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
    if (!closed) continue;
    const shape = new THREE.Shape(ring.slice(0, -1).map(([x, z]) => new THREE.Vector2(x, -z)));
    const geo = new THREE.ShapeGeometry(shape, 2).toNonIndexed();
    geo.rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position');
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrain.heightAt(pos.getX(i), pos.getZ(i)) + 0.25);
    geo.computeVertexNormals();
    parts.push(geo);
  }
  if (!parts.length) return null;
  const merged = new THREE.BufferGeometry();
  const total = parts.reduce((a, g) => a + g.getAttribute('position').count, 0);
  const posArr = new Float32Array(total * 3), nrmArr = new Float32Array(total * 3), colArr = new Float32Array(total * 3);
  let o = 0;
  const white = linearColour(0xf2f0e8);
  for (const g of parts) {
    posArr.set(g.getAttribute('position').array as Float32Array, o * 3);
    nrmArr.set(g.getAttribute('normal').array as Float32Array, o * 3);
    for (let i = 0; i < g.getAttribute('position').count; i++) colArr.set([white.r, white.g, white.b], (o + i) * 3);
    o += g.getAttribute('position').count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  const mat = vertexColourMaterial({ roughness: 0.95, flat: true });
  const mesh = new THREE.Mesh(merged, mat.clone());
  (mesh.material as THREE.MeshStandardMaterial).polygonOffset = true;
  (mesh.material as THREE.MeshStandardMaterial).polygonOffsetFactor = -2;
  mesh.receiveShadow = true;
  mesh.name = 'stone-sign';
  return mesh;
}

/** Pit lane surface along the mapped pit lane (asphalt + thin yellow edge lines), level with the pit straight. */
export function buildPitLane(track: Track, terrain: Terrain): THREE.Mesh | null {
  const tp = createTrackPoint();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const asphalt = linearColour(ROAD.asphalt), line = linearColour(ROAD.pitLaneLine);
  const half = 4.2;
  // Separate strips (from, to, lift, colour): hard-edged lines need their own vertices.
  const strips: Array<[number, number, number, THREE.Color]> = [
    [-half, half, 0.02, asphalt],
    [-half + 0.15, -half + 0.35, 0.035, line],
    [half - 0.35, half - 0.15, 0.035, line],
  ];
  for (const lane of F.pitLane) {
    const pts: XZ[] = [];
    for (let k = 0; k < lane.length - 1; k++) {
      const [ax, az] = lane[k], [bx, bz] = lane[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d < len; d += 3) pts.push([ax + ((bx - ax) * d) / len, az + ((bz - az) * d) / len]);
    }
    pts.push(lane[lane.length - 1]);
    // The lane lies on whatever surface is under each vertex: below the road where it runs
    // on the circuit (pit exit after Hell Corner), on the verge or sand inside the walls, and
    // on the terrain outside them (it never stands above the ground on a slab).
    const surfaceY = (x: number, z: number): number => {
      projectToTrack(track, x, z, -1, tp);
      const side = tp.d >= 0 ? track.left : track.right;
      const d = Math.abs(tp.d);
      if (d < side.edge[tp.index]) return heightAt(track, tp.index, tp.t, tp.d) - 0.06;
      if (d < side.wall[tp.index]) return heightAt(track, tp.index, tp.t, tp.d) + 0.03;
      return terrain.heightAt(x, z) + 0.05;
    };
    for (const [a, b, lift, c] of strips) {
      const base = pos.length / 3;
      pts.forEach(([x, z], k) => {
        const [nx, nz] = pts[Math.min(k + 1, pts.length - 1)];
        const [px, pz] = pts[Math.max(k - 1, 0)];
        let dx = nx - px, dz = nz - pz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        for (const side of [a, b]) {
          const vx = x + dz * side, vz = z - dx * side;
          pos.push(vx, surfaceY(vx, vz) + lift, vz);
          col.push(c.r, c.g, c.b);
        }
        if (k > 0) {
          const p0 = base + (k - 1) * 2, p1 = base + k * 2;
          idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
        }
      });
    }
    // Short skirts down the outer edges hide any hairline gap to the ground.
    for (const edge of [-half, half]) {
      const base = pos.length / 3;
      pts.forEach(([x, z], k) => {
        const [nx, nz] = pts[Math.min(k + 1, pts.length - 1)];
        const [px, pz] = pts[Math.max(k - 1, 0)];
        let dx = nx - px, dz = nz - pz;
        const l = Math.hypot(dx, dz) || 1;
        dx /= l; dz /= l;
        const ex = x + dz * edge, ez = z - dx * edge, ey = surfaceY(ex, ez);
        for (const drop of [0.02, -0.5]) {
          pos.push(ex, ey + drop, ez);
          col.push(asphalt.r * 0.8, asphalt.g * 0.8, asphalt.b * 0.8);
        }
        if (k > 0) {
          const p0 = base + (k - 1) * 2, p1 = base + k * 2;
          idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
        }
      });
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, vertexColourMaterial({ roughness: 0.9, flat: false, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  mesh.name = 'pit-lane';
  return mesh;
}
