import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { gableRoof, skillionRoof } from '@/props/core/prims';
import { box, quad } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import { StructureParts, V } from '@/props/structures/parts';

// Generic single-storey buildings in four styles. Front (+Z) faces the track/road.

type Style = 'amenities' | 'museum' | 'corporate' | 'shed';

/** Glass pane on the +Z face (or rotated for side walls). */
function pane(p: StructureParts, x: number, y: number, z: number, w: number, h: number, colour: number = BUILDING.glass, back = false): void {
  const s = back ? -1 : 1;
  p.glass.add(quad(V(x - (s * w) / 2, y, z), V(x + (s * w) / 2, y, z), V(x + (s * w) / 2, y + h, z), V(x - (s * w) / 2, y + h, z)), colour);
}

export function buildBuilding(opts: { width: number; depth: number; height: number; style: Style }): THREE.Group {
  const W = Math.max(3, opts.width);
  const D = Math.max(3, opts.depth);
  const H = Math.max(2.4, opts.height);
  const p = new StructureParts();
  const zf = D / 2;
  p.block(W + 1.2, 0.15, D + 1.2, 0, -0.02, 0, TRACKSIDE.concrete);

  if (opts.style === 'amenities') {
    // Brick toilet / amenities block: skillion roof, doors, high louvre windows.
    p.block(W, H, D, 0, 0, 0, BUILDING.brick, 0.03);
    p.base.add(skillionRoof(W + 0.8, D + 1.0, H + 0.1, H + 0.6, 0.12), PROPS_LOOK.buildings.roofs[0]);
    const doors = Math.max(2, Math.floor(W / 3));
    for (let i = 0; i < doors; i++) {
      const x = -W / 2 + (W * (i + 0.5)) / doors;
      p.block(1.0, 2.1, 0.06, x - 0.5, 0, zf + 0.03, BUILDING.colorbondGreen);
      pane(p, x + 0.7, H - 0.75, zf + 0.01, 1.0, 0.4, BUILDING.darkGrey);
    }
    p.block(W * 0.4, 0.6, 0.06, 0, H - 0.9, zf + 0.03, BUILDING.white);
  } else if (opts.style === 'museum') {
    // Modern museum: rendered volume, central glazed foyer, deep entrance canopy, clerestory box.
    p.block(W, H, D, 0, 0, 0, BUILDING.offWhite, 0.01);
    const gw = W * 0.45;
    p.block(gw + 0.6, H + 0.02, 0.3, 0, 0, zf - 0.1, BUILDING.darkGrey);
    pane(p, 0, 0.1, zf + 0.06, gw, H - 0.4);
    for (let i = 0; i <= 6; i++) p.block(0.1, H - 0.3, 0.12, -gw / 2 + (gw * i) / 6, 0.05, zf + 0.1, BUILDING.darkGrey);
    p.block(gw + 4, 0.35, 4, 0, H - 0.2, zf + 2, BUILDING.white);
    for (const s of [-1, 1]) p.beam(V(s * (gw / 2 + 1.6), 0, zf + 3.6), V(s * (gw / 2 + 1.6), H - 0.2, zf + 3.6), 0.12, BUILDING.grey, 6);
    p.block(W + 0.6, 0.6, D + 0.6, 0, H, 0, BUILDING.darkGrey);
    p.block(W * 0.35, 2.0, D * 0.4, -W * 0.15, H + 0.6, -D * 0.1, BUILDING.white);
    pane(p, -W * 0.15, H + 0.9, -D * 0.1 + D * 0.2 + 0.01, W * 0.33, 1.2);
    p.block(W * 0.3, 1.0, 0.08, W * 0.3, H - 1.6, zf + 0.04, BUILDING.white);
  } else if (opts.style === 'corporate') {
    // Glass box with white floor bands, roof overhang and plant on the roof.
    const floors = Math.max(1, Math.round(H / 3.5));
    const fh = H / floors;
    p.block(W - 0.3, H, D - 0.3, 0, 0, 0, BUILDING.darkGrey);
    for (let f = 0; f < floors; f++) {
      const y = f * fh;
      p.block(W, 0.5, D, 0, y + fh - 0.5, 0, BUILDING.white);
      pane(p, 0, y + 0.05, zf - 0.14, W - 0.4, fh - 0.6);
      pane(p, 0, y + 0.05, -zf + 0.14, W - 0.4, fh - 0.6, BUILDING.glass, true);
      p.glass.add(quad(V(W / 2 - 0.14, y + 0.05, zf - 0.2), V(W / 2 - 0.14, y + 0.05, -zf + 0.2), V(W / 2 - 0.14, y + fh - 0.55, -zf + 0.2), V(W / 2 - 0.14, y + fh - 0.55, zf - 0.2)), BUILDING.glass);
      p.glass.add(quad(V(-W / 2 + 0.14, y + 0.05, -zf + 0.2), V(-W / 2 + 0.14, y + 0.05, zf - 0.2), V(-W / 2 + 0.14, y + fh - 0.55, zf - 0.2), V(-W / 2 + 0.14, y + fh - 0.55, -zf + 0.2)), BUILDING.glass);
    }
    for (let i = 0; i <= Math.round(W / 3); i++) p.block(0.08, H - 0.5, 0.1, -W / 2 + 0.2 + ((W - 0.4) * i) / Math.round(W / 3), 0, zf - 0.08, BUILDING.white);
    p.block(W + 1.6, 0.3, D + 1.6, 0, H, 0, BUILDING.white);
    p.block(W * 0.3, 1.2, D * 0.3, W * 0.2, H + 0.3, -D * 0.15, BUILDING.grey);
  } else {
    // Colorbond shed with gable roof and two roller doors.
    const wall = PROPS_LOOK.buildings.roofs[0];
    p.base.add(box(W, H, D, 0, H / 2, 0), (f) => wallShade(f.normal, wall), { jitter: 0.02 });
    p.base.add(gableRoof(W + 0.5, D + 0.6, H, Math.min(2.5, D * 0.18), 0.1), BUILDING.roof);
    for (const s of [-1, 1]) {
      p.block(Math.min(4, W * 0.3), Math.min(4, H * 0.8), 0.08, s * W * 0.22, 0, zf + 0.04, BUILDING.offWhite);
    }
    p.block(0.9, 2.1, 0.06, W / 2 + 0.03, 0, 0, BUILDING.white);
  }
  return p.toGroup(`building-${opts.style}`);
}

function wallShade(n: THREE.Vector3, colour: number): THREE.Color {
  return new THREE.Color().setHex(colour).multiplyScalar(Math.abs(n.y) > 0.5 ? 0.9 : 1);
}
