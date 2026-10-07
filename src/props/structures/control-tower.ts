import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { box, loftRings } from '@/props/core/shapes';
import { StructureParts, V } from '@/props/structures/parts';

// Race-control tower: concrete stair/lift core, stacked office floors with
// ribbon windows, and a glazed control room on top whose glass leans outwards
// (so officials look down at the track), a deep roof and a mast.

export function buildControlTower(opts: { height: number }): THREE.Group {
  const H = Math.max(10, opts.height);
  const p = new StructureParts();
  const w = 9;
  const d = 8;
  const cabH = 3.6;
  const cabY = H - cabH - 0.6;
  const floorH = 3.4;
  const floors = Math.max(1, Math.floor((cabY - 0.5) / floorH));

  // Stair / lift core at the back, full height.
  p.block(3.6, H + 1.2, 3.6, -w / 2 + 1.6, 0, -d / 2 - 0.6, BUILDING.offWhite, 0.015);
  // Office floors: solid band + ribbon window band.
  for (let f = 0; f < floors; f++) {
    const y = f * floorH;
    p.block(w, floorH * 0.45, d, 0, y, 0, BUILDING.white, 0.01);
    p.block(w - 0.4, floorH * 0.55, d - 0.4, 0, y + floorH * 0.45, 0, BUILDING.darkGrey);
    for (const [x, z, gw, gd] of [[0, d / 2 - 0.19, w - 0.5, 0.02], [0, -d / 2 + 0.19, w - 0.5, 0.02], [w / 2 - 0.19, 0, 0.02, d - 0.5], [-w / 2 + 0.19, 0, 0.02, d - 0.5]]) {
      p.glass.add(box(gw, floorH * 0.5, gd, x, y + floorH * 0.45 + floorH * 0.27, z), BUILDING.glassLight);
    }
  }
  const top = floors * floorH;
  // Plinth between the offices and the control room.
  p.block(w + 0.6, cabY - top, d + 0.6, 0, top, 0, BUILDING.white, 0.01);
  // Control room: outward-leaning glass on all four sides.
  const lean = 0.7;
  const bottom = [V(-w / 2, cabY, d / 2), V(w / 2, cabY, d / 2), V(w / 2, cabY, -d / 2), V(-w / 2, cabY, -d / 2)];
  const upper = [V(-w / 2 - lean, cabY + cabH, d / 2 + lean), V(w / 2 + lean, cabY + cabH, d / 2 + lean), V(w / 2 + lean, cabY + cabH, -d / 2 - lean), V(-w / 2 - lean, cabY + cabH, -d / 2 - lean)];
  p.glass.add(loftRings([bottom, upper]), BUILDING.glassLight);
  // Mullions on the leaning glass.
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    for (const s of [-1, 1]) {
      const x0 = -w / 2 + t * w;
      const x1 = -w / 2 - lean + t * (w + 2 * lean);
      p.beam(V(x0, cabY, s * d / 2), V(x1, cabY + cabH, s * (d / 2 + lean)), 0.06, BUILDING.darkGrey);
    }
  }
  // Roof with a deep overhang and fascia, then mast and dishes.
  p.block(w + 2 * lean + 1.4, 0.5, d + 2 * lean + 1.4, 0, cabY + cabH, 0, BUILDING.white);
  p.block(w + 2 * lean + 1.45, 0.3, d + 2 * lean + 1.45, 0, cabY + cabH + 0.1, 0, BUILDING.darkGrey);
  p.beam(V(2, cabY + cabH + 0.5, -1.5), V(2, cabY + cabH + 6.5, -1.5), 0.08, TRACKSIDE.armco, 6);
  p.beam(V(1.4, cabY + cabH + 5.5, -1.5), V(2.6, cabY + cabH + 5.5, -1.5), 0.04, TRACKSIDE.armco);
  p.block(1.4, 0.9, 1.4, -2.5, cabY + cabH + 0.5, -2, BUILDING.grey);
  // Ground-floor entry canopy.
  p.block(4, 0.25, 2.2, 1.5, 3.0, d / 2 + 1.1, BUILDING.darkGrey);
  return p.toGroup('control-tower');
}
