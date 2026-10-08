// The 1979 Bathurst colour zones of the Torana A9X: white front half, red behind
// the doors, a red bonnet with a white chevron. primary = white, secondary =
// red, accent = black. Every sponsor word or logo is a plain colour block.
// Reference: docs/references/cars-torana.md section 3.
import type { Livery } from '@/types/car-model';
import type { LiveryShape } from '@/car/models/livery-paint';
import { liveryNumber } from '@/car/liveries';
import { fillPoly, hex, inRegion, roundRect, worldText, type Ctx } from '@/car/models/livery-canvas';
import type { Knot } from '@/car/models/curves';
import type { Outline } from '@/car/models/profile-types';

const SIDES = ['sideL', 'sideR'] as const;
const GREY = '#2b2d31';

/** Linear sample of a knot table (z ascending or descending) at z, clamped to its ends. */
function sample(knots: readonly Knot[], z: number): number {
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  if (z <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (z <= k[i][0]) {
      const t = (z - k[i - 1][0]) / (k[i][0] - k[i - 1][0]);
      return k[i - 1][1] + t * (k[i][1] - k[i - 1][1]);
    }
  }
  return k[k.length - 1][1];
}

/** A thin line along a curve y(z) from z0 to z1, drawn as a polyline of `width` metres. */
function curveLine(ctx: Ctx, y: (z: number) => number, z0: number, z1: number, width: number, colour: string): void {
  ctx.beginPath();
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    if (i) ctx.lineTo(z, y(z)); else ctx.moveTo(z, y(z));
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawSides(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const p = s.profile;
  const red = hex(l.secondary), white = hex(l.primary);
  const d = p.art.door;
  const zF = s.zFront + 0.3, zR = s.zRear - 0.3;
  const belt = (z: number) => sample(p.curves.beltY, z);
  const rail = (z: number) => sample(p.curves.railY, z);
  // The door's rear edge, extended up to the roof.
  const slope = (d[2][0] - d[3][0]) / (d[2][1] - d[3][1]);
  const zEdge = (y: number) => d[3][0] + slope * (y - d[3][1]);
  const cowl = p.z.cowl;
  for (const r of SIDES) inRegion(ctx, r, () => {
    fillPoly(ctx, [[zR, -1], [zR, 1.6], [zEdge(1.6), 1.6], [zEdge(-1), -1]], red);
    // Red stripe along the top edge of the front guard: 0.09 m at the cowl, 0.03 m at the nose.
    const top = (z: number) => belt(z) + 0.012;
    const wid = (z: number) => 0.03 + 0.06 * Math.max(0, Math.min(1, (z - s.zFront + 0.25) / (cowl - s.zFront + 0.25)));
    const steps = 16;
    const upper: Array<readonly [number, number]> = [], lower: Array<readonly [number, number]> = [];
    for (let i = 0; i <= steps; i++) {
      const z = zF - 0.3 - ((zF - 0.3 - cowl) * i) / steps;
      upper.push([z, top(z)]);
      lower.push([z, top(z) - wid(z) - 0.012]);
    }
    fillPoly(ctx, [...upper, ...lower.reverse()], red);
    // Thin white stripe along the sill edge of the red part, and a white pinstripe below
    // the quarter window and along the roof rail.
    ctx.fillStyle = white;
    ctx.fillRect(zR, 0.275, zEdge(0.275) - zR, 0.022);
    curveLine(ctx, (z) => belt(z) - 0.03, zEdge(0.8) - 0.02, p.z.sideRear - 0.45, 0.012, white);
    curveLine(ctx, (z) => rail(Math.max(z, p.z.sideRear)) + 0.03, zEdge(1.1) - 0.02, p.z.sideRear, 0.012, white);
  });
}

function drawDoors(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const d = s.profile.art.door;
  const zFront = Math.min(d[0][0], d[1][0]);
  const zRear = Math.max(d[2][0], d[3][0]);
  const white = hex(l.primary), black = hex(l.accent);
  const zBoard = zFront - 0.04 - 0.19;
  const zBar = (zBoard - 0.19 - 0.03 + zRear + 0.02) / 2;
  const barLen = zBoard - 0.19 - 0.03 - zRear - 0.02;
  for (const r of SIDES) {
    inRegion(ctx, r, () => {
      roundRect(ctx, zBoard, 0.63, 0.4, 0.34, 0.05, white);
      roundRect(ctx, zBoard, 0.63, 0.38, 0.32, 0.04, black);
      roundRect(ctx, zBar, 0.63, barLen, 0.3, 0.02, black);
    });
    worldText(ctx, r, liveryNumber(l), zBoard, 0.63, 0.25, 0.32, white, 800);
  }
}

/** Black rounded block with a white keyline on each rear quarter (replaces a team logo). */
function drawQuarters(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const z = (s.profile.z.rearGlassBase + s.profile.z.sideRear) / 2 - 0.05;
  for (const r of SIDES) inRegion(ctx, r, () => {
    roundRect(ctx, z, 0.5, 0.58, 0.26, 0.05, hex(l.primary));
    roundRect(ctx, z, 0.5, 0.56, 0.24, 0.04, hex(l.accent));
  });
}

function drawTop(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const p = s.profile;
  const red = hex(l.secondary), white = hex(l.primary), black = hex(l.accent);
  const zN = p.nose.zStart, zC = p.z.cowl, zR = s.zRear - 0.3;
  const len = zN - zC;
  const apex = zN - 0.45 * len;
  const half = 1.0;
  const roofLen = p.z.roofFront - p.z.roofRear;
  const zJ = p.z.roofFront - 0.45 * roofLen;
  inRegion(ctx, 'top', () => {
    // Rear 55 % of the roof, the deck and the spoiler: red, with a diagonal join.
    fillPoly(ctx, [[zR, -1.2], [zR, 1.2], [zJ - 0.17, 1.2], [zJ + 0.17, -1.2]], red);
    // Bonnet: red, then the white chevron from the full front edge.
    ctx.fillStyle = red;
    ctx.fillRect(zC, -1.2, zN + 0.3 - zC, 2.4);
    fillPoly(ctx, [[zN + 0.3, -half], [zN + 0.3, half], [apex, 0]], white);
    // Black bar across the chevron (replaces a sponsor word).
    const zb = apex + 0.5 * (zN - apex), hz = 0.06;
    const w = (z: number) => (half * (z - apex)) / (zN + 0.3 - apex) - 0.05;
    fillPoly(ctx, [[zb + hz, -w(zb + hz)], [zb + hz, w(zb + hz)], [zb - hz, w(zb - hz)], [zb - hz, -w(zb - hz)]], black);
    // Number plate on the rear bonnet hump.
    const zp = zC + 0.4;
    roundRect(ctx, zp, 0, 0.42, 0.28, 0.04, white);
  });
  worldText(ctx, 'top', liveryNumber(l), zC + 0.4, 0, 0.2, 0.36, black, 800);
}

function drawRear(ctx: Ctx, l: Livery): void {
  const red = hex(l.secondary), white = hex(l.primary), black = hex(l.accent);
  inRegion(ctx, 'rear', () => {
    const band: Outline = [[-2, 0.56], [2, 0.56], [2, 0.82], [-2, 0.82]];
    ctx.fillStyle = red;
    ctx.fillRect(-2, 0.82, 4, 1);
    fillPoly(ctx, band, white);
    ctx.fillStyle = black;
    ctx.fillRect(-0.32, 0.575, 0.64, 0.045);
    // Bumper: red on top with a white lower lip.
    ctx.fillStyle = red;
    ctx.fillRect(-2, 0.4, 4, 0.16);
    ctx.fillStyle = white;
    ctx.fillRect(-2, 0.34, 4, 0.06);
    // Round fuel cap in the centre of the band.
    ctx.beginPath();
    ctx.arc(0, 0.7, 0.055, 0, Math.PI * 2);
    ctx.fillStyle = GREY;
    ctx.fill();
  });
}

/** Paints the 1979 colour zones (call in place of the generic pattern). */
export function drawHdt79(ctx: Ctx, l: Livery, s: LiveryShape): void {
  drawSides(ctx, l, s);
  drawDoors(ctx, l, s);
  drawQuarters(ctx, l, s);
  drawTop(ctx, l, s);
  drawRear(ctx, l);
}

/** The white bar on the black board under the rear bumper (painted after the fascia art, which lays that board). */
export function drawHdt79Board(ctx: Ctx, l: Livery): void {
  inRegion(ctx, 'rear', () => {
    ctx.fillStyle = hex(l.primary);
    ctx.fillRect(-0.3, 0.275, 0.6, 0.03);
  });
}
