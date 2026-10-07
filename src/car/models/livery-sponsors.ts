// Where the sponsor decals sit on each car (world coordinates, metres): the
// main sponsor on the bonnet and along both doors, associates on the front
// guards, above the rear wheels, on the rear bumper and along the roof edges.
// Blocks are sized to leave the paint pattern visible around them.
import type { Livery } from '@/types/car-model';
import type { LiveryShape } from '@/car/models/livery-paint';
import { associate, mainSponsor, paintDecal, SPONSORS, type DecalSpec } from '@/car/models/livery-decals';
import type { Ctx } from '@/car/models/livery-canvas';

const SIDES = ['sideL', 'sideR'] as const;

export function drawSponsors(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const p = s.profile;
  const main = mainSponsor(l);
  const lead = SPONSORS[main];
  const decals: DecalSpec[] = [];
  // Doors: the main sponsor as a long strip below the number board.
  const d = p.art.door;
  const zDoorFront = Math.min(d[0][0], d[1][0]);
  const zDoorRear = Math.max(d[2][0], d[3][0]);
  const doorLen = zDoorFront - zDoorRear;
  // Front guard panel: between the wheel arch and where the side surface turns into the nose.
  const gStart = s.axleZ + p.arch.radius + 0.02;
  const gEnd = p.nose.zStart - p.nose.sweep * Math.pow(0.9, p.nose.sweepPow) - 0.02;
  const gLen = Math.min(0.32, gEnd - gStart);
  for (const region of SIDES) {
    decals.push({ region, a: (zDoorFront + zDoorRear) / 2, b: 0.27, len: doorLen - 0.14, hgt: 0.17, facing: 'canvas', sponsor: lead, style: 'line' });
    if (gLen > 0.15) decals.push({ region, a: (gStart + gEnd) / 2, b: 0.46, len: gLen, hgt: 0.09, facing: 'canvas', sponsor: associate(main, 1), style: 'name' });
    // Rear quarter, above the rear wheel arch.
    decals.push({ region, a: -s.axleZ, b: s.wheelR + p.arch.radius + 0.075, len: 0.5, hgt: 0.085, facing: 'canvas', sponsor: associate(main, 2), style: 'name' });
  }
  // Bonnet: main sponsor between the cowl and the bonnet extractor, readable from the front.
  const ventStart = Math.min(...p.art.bonnetVents.flat().map((v) => v[1]));
  const z0 = p.z.cowl + 0.1;
  const z1 = ventStart - 0.08;
  const bonnetH = Math.min(0.38, z1 - z0);
  if (bonnetH > 0.15) decals.push({ region: 'top', a: (z0 + z1) / 2, b: 0, len: 0.95, hgt: bonnetH, facing: 'fromFront', sponsor: lead, style: 'stack' });
  // Roof edges, either side of the roof number.
  const roofMid = (p.z.roofFront + p.z.roofRear) / 2;
  const roofLen = Math.min(0.6, p.z.roofFront - p.z.roofRear - 0.12);
  decals.push({ region: 'top', a: roofMid, b: 0.47, len: roofLen, hgt: 0.075, facing: 'leftEdge', sponsor: associate(main, 3), style: 'name' });
  decals.push({ region: 'top', a: roofMid, b: -0.47, len: roofLen, hgt: 0.075, facing: 'rightEdge', sponsor: associate(main, 3), style: 'name' });
  // Rear bumper, under the tail-lamp band.
  decals.push({ region: 'rear', a: 0, b: 0.5, len: 0.86, hgt: 0.11, facing: 'canvas', sponsor: associate(main, 4), style: 'line' });
  for (const decal of decals) paintDecal(ctx, decal);
}
