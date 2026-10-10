// Where the sponsor decals sit on each car (world coordinates, metres): the
// main sponsor on the bonnet and along both doors, associates along the sills,
// on the front guards, the rear quarters, the bonnet flanks, the roof edges and
// the rear bumper. Blocks are sized to leave the paint pattern visible around them.
import type { Livery } from '@/types/car-model';
import type { LiveryShape } from '@/car/models/livery-paint';
import { associate, mainSponsor, paintDecal, SPONSORS, type DecalSpec } from '@/car/models/livery-decals';
import type { Ctx } from '@/car/models/livery-canvas';

const SIDES = ['sideL', 'sideR'] as const;

export function drawSponsors(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const p = s.profile;
  const main = mainSponsor(l);
  const lead = SPONSORS[main];
  const R = p.arch.radius;
  const decals: DecalSpec[] = [];
  const d = p.art.door;
  const zDoorFront = Math.min(d[0][0], d[1][0]);
  const zDoorRear = Math.max(d[2][0], d[3][0]);
  const doorLen = zDoorFront - zDoorRear;
  // Front guard panel: between the wheel arch and where the side surface turns into the nose.
  const gStart = s.axleZ + R + 0.02;
  const gEnd = p.nose.zStart - p.nose.sweep * Math.pow(0.9, p.nose.sweepPow) - 0.02;
  const gLen = Math.min(0.32, gEnd - gStart);
  // Sill strip: three associates between the arches, just above the skirt.
  const sill0 = -s.axleZ + R + 0.08, sill1 = s.axleZ - R - 0.08;
  const seg = (sill1 - sill0) / 3;
  // Rear quarter ahead of the arch, between the door shut and the wheel.
  const qFront = zDoorRear - 0.04, qRear = -s.axleZ + R + 0.04;
  for (const region of SIDES) {
    decals.push({ region, a: (zDoorFront + zDoorRear) / 2, b: 0.315, len: doorLen - 0.14, hgt: 0.12, facing: 'canvas', sponsor: lead, style: 'line' });
    for (let i = 0; i < 3; i++) decals.push({ region, a: sill0 + seg * (i + 0.5), b: 0.212, len: seg - 0.06, hgt: 0.062, facing: 'canvas', sponsor: associate(main, 5 + i), style: 'name' });
    if (gLen > 0.15) decals.push({ region, a: (gStart + gEnd) / 2, b: 0.46, len: gLen, hgt: 0.09, facing: 'canvas', sponsor: associate(main, 1), style: 'name' });
    decals.push({ region, a: -s.axleZ, b: s.wheelR + R + 0.075, len: 0.44, hgt: 0.085, facing: 'canvas', sponsor: associate(main, 2), style: 'name' });
    if (qFront - qRear > 0.18) decals.push({ region, a: (qFront + qRear) / 2, b: 0.5, len: qFront - qRear, hgt: 0.085, facing: 'canvas', sponsor: associate(main, 6), style: 'name' });
  }
  // Bonnet: main sponsor between the cowl and the bonnet extractor, readable from the front; associates on the flanks.
  const vents = p.art.bonnetVents.flat().map((v) => v[1]);
  const ventStart = Math.min(...vents), ventEnd = Math.max(...vents);
  const z0 = p.z.cowl + 0.1;
  const z1 = ventStart - 0.08;
  const bonnetH = Math.min(0.38, z1 - z0);
  if (bonnetH > 0.15) decals.push({ region: 'top', a: (z0 + z1) / 2, b: 0, len: 0.95, hgt: bonnetH, facing: 'fromFront', sponsor: lead, style: 'stack' });
  for (const side of [1, -1]) decals.push({ region: 'top', a: (ventStart + ventEnd) / 2, b: side * 0.56, len: 0.34, hgt: 0.08, facing: 'fromFront', sponsor: associate(main, 7), style: 'name' });
  // Roof edges, either side of the roof number.
  const roofMid = (p.z.roofFront + p.z.roofRear) / 2;
  const roofLen = Math.min(0.6, p.z.roofFront - p.z.roofRear - 0.12);
  decals.push({ region: 'top', a: roofMid, b: 0.47, len: roofLen, hgt: 0.075, facing: 'leftEdge', sponsor: associate(main, 3), style: 'name' });
  decals.push({ region: 'top', a: roofMid, b: -0.47, len: roofLen, hgt: 0.075, facing: 'rightEdge', sponsor: associate(main, 3), style: 'name' });
  // Rear bumper: one across under the tail-lamp band, two smaller at the corners above it.
  decals.push({ region: 'rear', a: 0, b: 0.5, len: 0.86, hgt: 0.11, facing: 'canvas', sponsor: associate(main, 4), style: 'line' });
  for (const side of [1, -1]) decals.push({ region: 'rear', a: side * 0.5, b: 0.66, len: 0.36, hgt: 0.08, facing: 'canvas', sponsor: associate(main, side > 0 ? 5 : 6), style: 'name' });
  for (const decal of decals) paintDecal(ctx, decal);
}
