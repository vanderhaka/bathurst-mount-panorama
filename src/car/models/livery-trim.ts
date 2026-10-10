// Panel joints and glass surrounds painted into every livery: crisp dark shut
// lines (bonnet, doors, boot, bumper seams, fuel flap) a fixed 2-3 texels wide
// with a light catch edge, and the black rubber seals around all the glass.
// The atlas is anisotropic (a top-view texel is three times longer across the
// car than along it), so line widths are set per segment direction.
import type { LiveryShape } from '@/car/models/livery-paint';
import { compileCurves, type CurveSet } from '@/car/models/body-section';
import { fillPoly, grow, inRegion, type Affine, type Ctx } from '@/car/models/livery-canvas';
import type { Outline } from '@/car/models/profile-types';

const SIDES = ['sideL', 'sideR'] as const;
const GAP = 'rgba(0,0,0,0.88)';
const CATCH = 'rgba(255,255,255,0.3)';
/** Shut-line width (texels); the catch edge sits one texel beside it. */
const LINE_PX = 2.8;
const SEAL_COLOUR = '#121316';
/** Width (m) of the seal band along each glass edge. */
const SEAL = 0.028;

/** Strokes a polyline `px` texels wide whatever its direction. */
function strokePx(ctx: Ctx, a: Affine, pts: Outline, px: number, colour: string, close: boolean): void {
  const n = pts.length;
  ctx.strokeStyle = colour;
  ctx.lineCap = 'round';
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
    ctx.lineWidth = px / Math.hypot(dy * a.sx, dx * a.sy);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
}

/** A shut line: the dark gap over a light catch edge offset one texel towards +b (up the side, out across the top). */
function shutLine(ctx: Ctx, a: Affine, pts: Outline, close = false): void {
  const off = 1 / Math.abs(a.sy);
  strokePx(ctx, a, pts.map(([p, q]) => [p, q + off] as const), LINE_PX, CATCH, close);
  strokePx(ctx, a, pts, LINE_PX, GAP, close);
}

/** Raked outlet at the rear of each front guard, between the wheel arch and the door. */
function guardOutlet(ctx: Ctx, zDoor: number): void {
  const o: Outline = [[zDoor + 0.035, 0.55], [zDoor + 0.135, 0.585], [zDoor + 0.165, 0.735], [zDoor + 0.065, 0.715]];
  fillPoly(ctx, grow(o, 0.01), '#2a2c30');
  fillPoly(ctx, o, '#0d0e10');
  ctx.strokeStyle = '#2d3034';
  ctx.lineWidth = 0.009;
  for (const t of [0.3, 0.55, 0.8]) {
    ctx.beginPath();
    ctx.moveTo(zDoor + 0.035 + t * 0.03 + 0.005, 0.55 + t * 0.165);
    ctx.lineTo(zDoor + 0.135 + t * 0.03 - 0.005, 0.585 + t * 0.15);
    ctx.stroke();
  }
}

/** Rounded fuel flap outline on the left rear quarter, behind the arch. */
function fuelFlap(ctx: Ctx, a: Affine, s: LiveryShape): void {
  const z = -s.axleZ - 0.3, y = 0.76, w = 0.065, h = 0.055, r = 0.02;
  const pts: Array<readonly [number, number]> = [];
  for (let k = 0; k < 4; k++) {
    const cx = z + (k === 0 || k === 3 ? w - r : r - w), cy = y + (k < 2 ? h - r : r - h);
    for (let i = 0; i <= 3; i++) {
      const t = (k * Math.PI) / 2 + (i * Math.PI) / 6;
      pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
    }
  }
  shutLine(ctx, a, pts, true);
}

function drawSideLines(ctx: Ctx, s: LiveryShape): void {
  const p = s.profile;
  const bumper = s.axleZ + p.arch.radius + 0.08;
  for (const r of SIDES) inRegion(ctx, r, (a) => {
    if (s.kind !== 'torana') guardOutlet(ctx, p.art.door[0][0]);
    shutLine(ctx, a, p.art.door, true);
    // Bumper cover seams behind the front arch and ahead of the rear arch.
    shutLine(ctx, a, [[bumper, 0.17], [bumper, 0.66]]);
    shutLine(ctx, a, [[-bumper, 0.17], [-bumper, 0.66]]);
    // The Torana fills through the round cap on its rear panel (livery-hdt79.ts).
    if (r === 'sideL' && s.kind !== 'torana') fuelFlap(ctx, a, s);
    ctx.fillStyle = '#141517';
    ctx.fillRect(-3, -0.2, 6, 0.36);
    const rearTop = p.art.door[2];
    ctx.beginPath();
    ctx.roundRect(rearTop[0] + 0.095, rearTop[1] - 0.085, 0.13, 0.03, 0.012);
    ctx.fillStyle = 'rgba(10,10,12,0.75)';
    ctx.fill();
    const g = ctx.createLinearGradient(0, 0.08, 0, 0.34);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-3, 0, 6, 0.34);
  });
}

function drawTopLines(ctx: Ctx, s: LiveryShape, cv: CurveSet): void {
  const p = s.profile;
  const zc = p.z.cowl + 0.06;
  const zb = p.z.rearGlassBase - 0.05;
  const xb = cv.glassBaseX(zc) - 0.05;
  const xd = Math.min(0.78, cv.glassBaseX(zb) - 0.06);
  inRegion(ctx, 'top', (a) => {
    shutLine(ctx, a, [[s.zFront - 0.05, -xb], [zc, -xb], [zc, xb], [s.zFront - 0.05, xb]]);
    shutLine(ctx, a, [[s.zRear + 0.04, -xd], [zb, -xd], [zb, xd], [s.zRear + 0.04, xd]]);
  });
  // Boot lid lower edge across the tail, just above the lamps.
  const yBoot = Math.max(...p.taillight.outline.map((q) => q[1])) + 0.03;
  inRegion(ctx, 'rear', (a) => shutLine(ctx, a, [[-0.8, yBoot], [0.8, yBoot]]));
}

/** Band of width `w` along the edge x(z) (towards +x when `out`), for z0..z1, mirrored to both sides. */
function edgeBand(ctx: Ctx, z0: number, z1: number, x: (z: number) => number, w: number, out: boolean): void {
  const n = 14;
  const near: Array<readonly [number, number]> = [], far: Array<readonly [number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const z = z0 + ((z1 - z0) * i) / n;
    near.push([z, x(z)]);
    far.push([z, x(z) + (out ? w : -w)]);
  }
  const o: Outline = [...near, ...far.reverse()];
  fillPoly(ctx, o, SEAL_COLOUR);
  fillPoly(ctx, o.map(([z, xx]) => [z, -xx] as const), SEAL_COLOUR);
}

/** Black seals around the windscreen, side glass and rear glass (all in the top region: everything above the shoulder maps there). */
function drawGlassSeals(ctx: Ctx, s: LiveryShape, cv: CurveSet): void {
  const z = s.profile.z;
  const g1x = (zz: number) => (zz <= z.sideFront && zz >= z.sideRear ? cv.railX(zz) : cv.glassBaseX(zz));
  const r0x = (zz: number) => g1x(zz) - cv.pillarW(zz);
  const r1x = (zz: number) => Math.min(cv.rearGlassX(zz), r0x(zz) - 0.03);
  inRegion(ctx, 'top', () => {
    ctx.fillStyle = SEAL_COLOUR;
    // Windscreen base and top, rear glass top and base: bands across between the pillar seals.
    const xw = r0x(z.cowl) + SEAL, xt = r0x(z.roofFront) + SEAL;
    const xr = r1x(z.roofRear) + SEAL, xrb = r1x(z.rearGlassBase) + SEAL;
    ctx.fillRect(z.cowl, -xw, SEAL, 2 * xw);
    ctx.fillRect(z.roofFront - SEAL, -xt, SEAL, 2 * xt);
    ctx.fillRect(z.roofRear, -xr, SEAL, 2 * xr);
    ctx.fillRect(z.rearGlassBase - SEAL, -xrb, SEAL, 2 * xrb);
    // A-pillars (windscreen edges), the roof rail over the side glass, the side-glass base and the rear-glass edges.
    edgeBand(ctx, z.roofFront, z.cowl, r0x, SEAL, true);
    edgeBand(ctx, z.sideRear, z.sideFront, cv.railX, SEAL, false);
    edgeBand(ctx, z.sideRear, z.sideFront, cv.glassBaseX, 0.02, true);
    edgeBand(ctx, z.rearGlassBase, z.roofRear, r1x, SEAL, true);
  });
}

/** Paints the shut lines and glass seals (call after the pattern, before the decals). */
export function drawTrim(ctx: Ctx, s: LiveryShape): void {
  const cv = compileCurves(s.profile.curves);
  drawSideLines(ctx, s);
  drawTopLines(ctx, s, cv);
  drawGlassSeals(ctx, s, cv);
}
