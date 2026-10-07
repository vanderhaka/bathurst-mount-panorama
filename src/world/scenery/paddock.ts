import * as THREE from 'three';
import { LIVERY_COLOURS, TRACKSIDE } from '@/art/palette';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import { PROP_VARIANTS } from '@/props';
import type { Track } from '@/track/track-model';
import type { Terrain } from '@/world/terrain';
import { pitComplexPlacement } from '@/world/scenery/buildings';
import { rng, type SpatialMask } from '@/world/scenery/geo';
import type { PropInstancer } from '@/world/scenery/instancer';

/** Race-week paddock behind the pit complex: two rows of team transporters with awnings. */
const ROWS = [{ back: 24, facing: 1 }, { back: 58, facing: -1 }];
const SPACING = 9.5;
const TEAM = Object.values(LIVERY_COLOURS).map(linearColour);
const CHASSIS = linearColour(TRACKSIDE.tyre), CAB_GLASS = linearColour(0x26313a), SILVER = linearColour(0xb9bfc4);

export function buildPaddock(track: Track, terrain: Terrain, inst: PropInstancer, mask: SpatialMask): THREE.Mesh | null {
  const pit = pitComplexPlacement(track);
  if (!pit) return null;
  const r = rng(1999);
  const pos: number[] = [], col: number[] = [];
  // Building frame: +Z towards the track, X along the building. The paddock is at -Z.
  const c = Math.cos(pit.yaw), s = Math.sin(pit.yaw);
  const toWorld = (lx: number, lz: number): [number, number] => [pit.cx + lx * c + lz * s, pit.cz - lx * s + lz * c];
  const half = pit.length / 2 - 6;
  for (const row of ROWS) {
    for (let lx = -half; lx <= half; lx += SPACING) {
      if (r() < 0.12) continue; // the odd gap
      const lz = -(pit.width / 2 + row.back);
      const [x, z] = toWorld(lx, lz);
      const y = terrain.heightAt(x, z) - 0.05;
      const team = TEAM[Math.floor(r() * TEAM.length)];
      // Trailer parked nose away from the pit building (row 1) or towards it (row 2).
      const yaw = pit.yaw + (row.facing > 0 ? Math.PI : 0);
      transporter(pos, col, x, y, z, yaw, team);
      mask.add(x, z, 12);
      // Team awning between the truck and the next one, on the pit-building side.
      const [ax, az] = toWorld(lx + SPACING / 2, lz + row.facing * 9);
      inst.add('gazebo', Math.floor(r() * PROP_VARIANTS.gazebo), ax, terrain.heightAt(ax, az), az, pit.yaw, 1.4, LIVERY_COLOURS.carbonBlack);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, vertexColourMaterial({ roughness: 0.6, flat: true, side: THREE.DoubleSide }));
  mesh.name = 'paddock-transporters';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Prime mover and a 14.5 m box trailer in the team colour (about 60 triangles). */
function transporter(pos: number[], col: number[], cx: number, y: number, cz: number, yaw: number, team: THREE.Color): void {
  const box = (lx: number, ly: number, lz: number, w: number, h: number, d: number, k: THREE.Color, sideK = k) => {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const P = (a: number, b: number, e: number): number[] => [cx + (lx + a) * cs + (lz + e) * sn, y + ly + b, cz - (lx + a) * sn + (lz + e) * cs];
    const x0 = -w / 2, x1 = w / 2, z0 = -d / 2, z1 = d / 2;
    const q = (a: number[], b: number[], cc: number[], dd: number[], kk: THREE.Color) => {
      pos.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
      for (let i = 0; i < 6; i++) col.push(kk.r, kk.g, kk.b);
    };
    q(P(x0, 0, z0), P(x1, 0, z0), P(x1, h, z0), P(x0, h, z0), k);
    q(P(x0, 0, z1), P(x0, h, z1), P(x1, h, z1), P(x1, 0, z1), k);
    q(P(x0, 0, z0), P(x0, h, z0), P(x0, h, z1), P(x0, 0, z1), sideK);
    q(P(x1, 0, z0), P(x1, 0, z1), P(x1, h, z1), P(x1, h, z0), sideK);
    q(P(x0, h, z0), P(x1, h, z0), P(x1, h, z1), P(x0, h, z1), SILVER);
  };
  box(0, 0.5, -2.2, 2.5, 0.6, 14.5, CHASSIS);
  box(0, 1.1, -2.2, 2.5, 3.0, 14.5, team);
  box(0, 1.15, -2.2, 2.52, 0.35, 14.52, SILVER); // stripe
  box(0, 0.5, 6.6, 2.4, 2.4, 2.6, team, team);
  box(0, 2.0, 7.92, 2.2, 0.8, 0.02, CAB_GLASS);
}
