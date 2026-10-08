import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getGraphics, QUALITY } from '@/config/graphics';
import { extrude, quad } from '@/props/core/shapes';
import { gableRoof, skillionRoof } from '@/props/core/prims';
import { createRng } from '@/props/core/rng';
import { StructureParts, V } from '@/props/structures/parts';
import type { QualityPreset } from '@/render/renderer';
import type { Track } from '@/track/track-model';
import { adelaideCityPlacements, type AdelaideBuilding } from '@/world/adelaide-layout';
import type { Terrain } from '@/world/terrain';

const STONE = [0xbca987, 0xb39a79, 0xa28d75, 0xc2b59e, 0xb19f88];
const TRIM = 0xd3cab5, GLASS = 0x52656a, STEEL = 0x656c6d;

/** Arched window silhouettes and recessed sashes give the street edge a masonry character. */
function windowArch(p: StructureParts, x: number, y: number, z: number, width: number, height: number): void {
  const r = width / 2, shoulder = height - r;
  const outline: Array<[number, number]> = [[-r, 0], [r, 0], [r, shoulder]];
  for (let i = 1; i <= 8; i++) { const a = i * Math.PI / 8; outline.push([Math.cos(a) * r, shoulder + Math.sin(a) * r]); }
  p.glass.add(extrude(outline, 0.035).translate(x, y, z), GLASS);
  p.block(width + 0.3, 0.14, 0.24, x, y - 0.1, z + 0.04, TRIM);
  p.block(0.08, height - r * 0.4, 0.04, x, y, z + 0.06, TRIM);
  p.block(width, 0.08, 0.04, x, y + shoulder * 0.6, z + 0.06, TRIM);
}

function heritage(p: StructureParts, building: AdelaideBuilding, detailed: boolean): void {
  const { width: w, depth: d, height: h } = building, random = createRng(building.seed);
  const wall = STONE[building.seed % STONE.length], z = d / 2;
  p.block(w, h, d, 0, 0, 0, wall, 0.012);
  p.block(w + 0.8, 0.28, d + 0.5, 0, h - 0.45, 0, TRIM);
  p.base.add(gableRoof(w - 0.8, d - 0.7, h - 0.35, 1.2 + random() * 0.8, 0.12), 0x6a6962);
  // Front parapet masks the roof's lower edge; a raised central section varies the silhouette.
  p.block(w + 0.4, 0.75, 0.45, 0, h - 0.38, z - 0.1, wall);
  p.block(w * 0.28, 0.55, 0.45, 0, h + 0.36, z - 0.1, TRIM);
  const floors = Math.max(1, Math.floor(h / 3.6)), columns = Math.max(2, Math.floor(w / (detailed ? 3.8 : 5.5)));
  const pitch = w / columns;
  for (let f = 0; f < floors; f++) {
    if (f > 0) p.block(w + 0.2, 0.20, 0.34, 0, f * 3.45 - 0.2, z + 0.06, TRIM);
    for (let i = 0; i < columns; i++) {
      const x = -w / 2 + pitch * (i + 0.5);
      windowArch(p, x, f * 3.45 + 0.65, z + 0.012, Math.min(1.7, pitch * 0.52), 2.25);
    }
  }
  // Slim verandah at street level, rather than a row of opaque advertising boards.
  p.base.add(skillionRoof(w + 0.5, 3.1, 3.15, 3.35, 0.10).translate(0, 0, z + 1.35), 0x646a62);
  for (let x = -w / 2 + 0.4; x <= w / 2; x += Math.max(4.5, w / 4)) p.beam(V(x, 0, z + 2.7), V(x, 3.2, z + 2.7), 0.055, STEEL, 6);
  if (detailed) for (const side of [-1, 1]) for (let y = 0.3; y < h - 0.8; y += 0.85) {
    p.block(0.44, 0.34, 0.14, side * (w / 2 - 0.1), y, z + 0.05, TRIM);
  }
}

function office(p: StructureParts, building: AdelaideBuilding, detailed: boolean): void {
  const { width: w, depth: d, height: h } = building;
  const wall = building.seed % 2 ? 0xa8aaa3 : 0x899590;
  p.block(w, h, d, 0, 0, 0, wall, 0.01);
  const floors = Math.max(2, Math.round(h / (detailed ? 3.8 : 7))), step = h / floors;
  for (let f = 0; f < floors; f++) {
    const y = f * step + 0.45;
    for (const sign of [-1, 1]) {
      const z = sign * (d / 2 + 0.012);
      p.glass.add(quad(V(-sign * (w / 2 - 0.5), y, z), V(sign * (w / 2 - 0.5), y, z),
        V(sign * (w / 2 - 0.5), y + step * 0.70, z), V(-sign * (w / 2 - 0.5), y + step * 0.70, z)), GLASS);
      p.block(w + 0.2, 0.28, 0.15, 0, y + step * 0.73, z, 0xc6c9bf);
    }
  }
  const columns = detailed ? Math.max(2, Math.round(w / 4.2)) : 3;
  for (let i = 0; i <= columns; i++) p.block(0.15, h, 0.12, -w / 2 + w * i / columns, 0, d / 2 + 0.05, wall);
  p.block(w + 1.2, 0.6, d + 1.2, 0, h, 0, 0xc6c9bf);
  p.block(w * 0.24, 2.2, d * 0.25, w * 0.18, h + 0.6, -d * 0.12, STEEL);
  if (detailed) for (const sign of [-1, 1]) p.block(0.6, h + 0.7, d + 0.2, sign * (w / 2 - 0.1), 0, 0, 0xc6c9bf);
}

/** Merged by district and shared material: dozens of façades cost at most six draws. */
export function buildAdelaideCity(track: Track, terrain: Terrain, quality: QualityPreset): THREE.Group {
  const group = new THREE.Group(); group.name = 'adelaide-city';
  const tier = QUALITY[quality], cfg = getGraphics(), placements = adelaideCityPlacements(track, terrain, quality);
  for (const district of ['street', 'skyline'] as const) {
    const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const building of placements.filter(p => p.district === district)) {
      const p = new StructureParts(), detailed = quality !== 'low' && (district === 'street' || cfg.distantLandmarks && tier.distantLandmarks);
      if (building.heritage) heritage(p, building, detailed); else office(p, building, detailed);
      const object = p.toGroup(`adelaide-building-${building.seed}`);
      object.position.set(building.x, terrain.heightAt(building.x, building.z), building.z); object.rotation.y = building.yaw;
      object.updateMatrixWorld(true);
      object.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        const material = o.material as THREE.Material, geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
        const list = parts.get(material); if (list) list.push(geo); else parts.set(material, [geo]);
        o.geometry.dispose();
      });
    }
    let i = 0;
    for (const [material, geometries] of parts) {
      const merged = mergeGeometries(geometries); geometries.forEach(geo => geo.dispose());
      const mesh = new THREE.Mesh(merged, material); mesh.name = `adelaide-${district}-${i++}`;
      mesh.castShadow = district === 'street'; mesh.receiveShadow = true; group.add(mesh);
    }
  }
  return group;
}

/** A generated temporary pit pavilion, with garages and upper hospitality glazing. */
export function buildAdelaidePitPavilion(): THREE.Group {
  const p = new StructureParts(), length = 170, depth = 14, bays = 17, pitch = length / bays, z = depth / 2;
  p.block(length, 3.8, depth, 0, 0, 0, 0xd8dad1, 0.008);
  p.block(length + 1.2, 0.25, depth + 3.4, 0, 3.8, 1.4, 0xbfc3bd);
  p.block(length, 3.1, depth - 1.3, 0, 4.05, -0.65, 0xd1d5d0);
  p.block(length + 1.8, 0.27, depth + 5.3, 0, 7.2, 1.8, 0xd9dcd2);
  p.block(length + 2, 0.72, 0.18, 0, 6.9, z + 4.4, 0x4d5757);
  for (let i = 0; i <= bays; i++) {
    const x = -length / 2 + pitch * i;
    p.block(0.45, 7.15, 0.55, x, 0, z - 0.1, 0xe1e0d3);
    if (i % 2 === 0) p.beam(V(x, 0, z + 2.8), V(x, 7.2, z + 2.8), 0.075, STEEL, 6);
    if (i === bays) continue;
    const cx = x + pitch / 2;
    p.block(pitch - 0.65, 3.2, 0.08, cx, 0.1, z + 0.02, 0x7d8685);
    for (const y of [0.9, 1.7, 2.5]) p.block(pitch - 0.65, 0.05, 0.03, cx, y, z + 0.07, 0x616867);
    p.glass.add(quad(V(x + 0.35, 4.35, z), V(x + pitch - 0.35, 4.35, z), V(x + pitch - 0.35, 6.95, z), V(x + 0.35, 6.95, z)), GLASS);
    p.block(pitch - 0.65, 0.33, 0.08, cx, 3.36, z + 0.05, 0xd9dcd2);
    p.block(0.13, 2.6, 0.10, cx, 4.35, z + 0.03, STEEL);
    // Plain garage panels and muted alternating fascias keep real sponsors out of the world.
    p.block(3.5, 0.48, 0.04, cx, 3.40, z + 0.10, i % 3 === 0 ? 0x8a4439 : 0x455968);
  }
  for (const side of [-1, 1]) {
    p.block(4.1, 7.2, 5.2, side * (length / 2 + 1), 0, -depth / 2 + 2.6, 0xa8b1ac);
    p.block(4.4, 0.3, 5.5, side * (length / 2 + 1), 7.2, -depth / 2 + 2.6, 0xd9dcd2);
  }
  return p.toGroup('adelaide-pit-pavilion');
}
