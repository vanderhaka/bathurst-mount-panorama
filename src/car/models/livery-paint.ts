// Paints a generated livery (base colour, pattern, sponsor decals, numbers,
// banner text) and the painted-on details (grilles, light housings, vents,
// shut lines) onto the atlas.
import type { Livery } from '@/types/car-model';
import type { CarKind } from '@/car/car-specs';
import type { BodyProfile, Outline } from '@/car/models/profile-types';
import { contrastOn, fillPoly, grow, hex, inRegion, luminance, mirrorX, poly, roundRect, worldText, type Ctx } from '@/car/models/livery-canvas';
import { drawSponsors } from '@/car/models/livery-sponsors';

export interface LiveryShape {
  kind: CarKind;
  profile: BodyProfile;
  /** Front-most and rear-most body z. */
  zFront: number;
  zRear: number;
  /** Front axle z (rear axle at -axleZ) and wheel radius. */
  axleZ: number;
  wheelR: number;
}

const BLACK = '#0c0d0f';
const SIDES = ['sideL', 'sideR'] as const;

/**
 * Mustang 'stripes': one wide stripe offset to the driver's side with accent
 * pinstripes, and a two-tone tail (secondary colour below the light line), so
 * that from behind it reads differently from the Camaro's twin centre stripes.
 */
function drawOffsetStripe(ctx: Ctx, l: Livery, zF: number, zR: number): void {
  const sec = hex(l.secondary);
  const acc = hex(l.accent);
  const band: readonly [number, number] = [-0.46, -0.12];
  const pins: Array<readonly [number, number]> = [[-0.5, -0.48], [-0.1, -0.08]];
  inRegion(ctx, 'top', () => {
    ctx.fillStyle = sec; ctx.fillRect(zR, band[0], zF - zR, band[1] - band[0]);
    ctx.fillStyle = acc; for (const [a, b] of pins) ctx.fillRect(zR, a, zF - zR, b - a);
  });
  for (const r of ['front', 'rear'] as const) inRegion(ctx, r, () => {
    ctx.fillStyle = sec; ctx.fillRect(band[0], -1, band[1] - band[0], 3);
    ctx.fillStyle = acc; for (const [a, b] of pins) ctx.fillRect(a, -1, b - a, 3);
  });
  inRegion(ctx, 'rear', () => {
    ctx.fillStyle = sec; ctx.fillRect(-2, -1, 4, 1.56);
    ctx.fillStyle = acc; ctx.fillRect(-2, 0.56, 4, 0.03);
  });
  for (const r of SIDES) inRegion(ctx, r, () => {
    fillPoly(ctx, [[zR, -1], [zR, 0.56], [-1.75, 0.56], [-1.2, 0.3], [-1.2, -1]], sec);
    ctx.fillStyle = sec; ctx.fillRect(-1.25, 0.235, zF + 1.25, 0.1);
    ctx.fillStyle = acc; ctx.fillRect(-1.25, 0.35, zF + 1.25, 0.018);
    fillPoly(ctx, [[zR, 0.56], [zR, 0.59], [-1.735, 0.59], [-1.18, 0.315], [-1.2, 0.3], [-1.75, 0.56]], acc);
  });
}

function drawPattern(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const sec = hex(l.secondary);
  const acc = hex(l.accent);
  const zF = s.zFront + 0.3;
  const zR = s.zRear - 0.3;
  if (l.pattern === 'stripes' && s.kind === 'mustang') {
    drawOffsetStripe(ctx, l, zF, zR);
  } else if (l.pattern === 'stripes') {
    const bands = (x0: number, x1: number) => [[-x1, -x0], [x0, x1]] as const;
    inRegion(ctx, 'top', () => {
      for (const [a, b] of bands(0.06, 0.23)) { ctx.fillStyle = sec; ctx.fillRect(zR, a, zF - zR, b - a); }
      for (const [a, b] of bands(0.255, 0.275)) { ctx.fillStyle = acc; ctx.fillRect(zR, a, zF - zR, b - a); }
    });
    for (const r of ['front', 'rear'] as const) inRegion(ctx, r, () => {
      for (const [a, b] of bands(0.06, 0.23)) { ctx.fillStyle = sec; ctx.fillRect(a, -1, b - a, 3); }
      for (const [a, b] of bands(0.255, 0.275)) { ctx.fillStyle = acc; ctx.fillRect(a, -1, b - a, 3); }
    });
    for (const r of SIDES) inRegion(ctx, r, () => {
      ctx.fillStyle = sec; ctx.fillRect(zR, 0.235, zF - zR, 0.1);
      ctx.fillStyle = acc; ctx.fillRect(zR, 0.35, zF - zR, 0.018);
    });
  } else if (l.pattern === 'split') {
    for (const r of SIDES) inRegion(ctx, r, () => {
      fillPoly(ctx, [[zF, -1], [zF, 0.46], [zR, 0.58], [zR, -1]], sec);
      fillPoly(ctx, [[zF, 0.46], [zF, 0.485], [zR, 0.605], [zR, 0.58]], acc);
    });
    inRegion(ctx, 'front', () => { ctx.fillStyle = sec; ctx.fillRect(-2, -1, 4, 1.46); ctx.fillStyle = acc; ctx.fillRect(-2, 0.46, 4, 0.025); });
    inRegion(ctx, 'rear', () => { ctx.fillStyle = sec; ctx.fillRect(-2, -1, 4, 1.58); ctx.fillStyle = acc; ctx.fillRect(-2, 0.58, 4, 0.025); });
    inRegion(ctx, 'top', () => { fillPoly(ctx, [[1.05, -1.2], [zF, -1.2], [zF, 1.2], [1.05, 1.2]], sec); ctx.fillStyle = acc; ctx.fillRect(1.02, -1.2, 0.03, 2.4); });
  } else if (l.pattern === 'chevron') {
    const chev = (z0: number, d: number, t: number, yl: number, yh: number): Outline => {
      const ym = (yl + yh) / 2;
      return [[z0, yl], [z0 + d, ym], [z0, yh], [z0 - t, yh], [z0 + d - t, ym], [z0 - t, yl]];
    };
    for (const r of SIDES) inRegion(ctx, r, () => {
      fillPoly(ctx, chev(-1.25, 0.32, 0.2, 0.16, 0.86), sec);
      fillPoly(ctx, chev(-0.82, 0.32, 0.2, 0.16, 0.86), sec);
      fillPoly(ctx, chev(-0.4, 0.32, 0.09, 0.16, 0.86), acc);
    });
    inRegion(ctx, 'top', () => {
      fillPoly(ctx, chev(1.15, 0.5, 0.26, -0.8, 0.8), sec);
      fillPoly(ctx, chev(1.6, 0.5, 0.1, -0.8, 0.8), acc);
    });
  } else {
    const arrow: Outline = [[zR, 0.2], [0.25, 0.29], [0.28, 0.16], [1.2, 0.47], [0.28, 0.79], [0.25, 0.66], [zR, 0.74]];
    for (const r of SIDES) inRegion(ctx, r, () => {
      fillPoly(ctx, grow(arrow, 0.03), acc);
      fillPoly(ctx, arrow, sec);
    });
    inRegion(ctx, 'top', () => {
      const a: Outline = [[0.8, -0.13], [1.55, -0.13], [1.55, -0.32], [2.25, 0], [1.55, 0.32], [1.55, 0.13], [0.8, 0.13]];
      fillPoly(ctx, grow(a, 0.025), acc);
      fillPoly(ctx, a, sec);
    });
  }
}

function honeycomb(ctx: Ctx, area: Outline, cell: number): void {
  ctx.save();
  poly(ctx, area);
  ctx.clip();
  ctx.strokeStyle = '#2b2e33';
  ctx.lineWidth = cell * 0.22;
  const xs = area.map((p) => p[0]), ys = area.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const h = cell * Math.sqrt(3) / 2;
  for (let row = 0, y = y0; y < y1 + h; y += h, row++) {
    for (let x = x0 + (row % 2) * cell * 0.75; x < x1 + cell; x += cell * 1.5) {
      ctx.beginPath();
      for (let k = 0; k <= 6; k++) {
        const ang = (Math.PI / 3) * k;
        const px = x + (cell / 2) * Math.cos(ang), py = y + (cell / 2) * Math.sin(ang);
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFascia(ctx: Ctx, s: LiveryShape): void {
  const { art, headlight, taillight } = s.profile;
  inRegion(ctx, 'front', () => {
    ctx.fillStyle = '#141517';
    ctx.fillRect(-2, -1, 4, 1.145);
    for (const o of art.frontDark ?? []) fillPoly(ctx, o, '#0d0e10');
    for (const o of art.frontOpenings) {
      fillPoly(ctx, grow(o, 0.012), '#3a3d42');
      fillPoly(ctx, o, BLACK);
    }
    for (const o of art.frontMesh) honeycomb(ctx, o, 0.036);
    const st = art.intakeStrut;
    if (st) {
      ctx.fillStyle = '#2a2c30';
      ctx.fillRect(st.x - st.width / 2, st.y0, st.width, st.y1 - st.y0);
    }
    for (const o of [headlight.outline, mirrorX(headlight.outline)]) fillPoly(ctx, grow(o, 0.014), BLACK);
    const g = ctx.createLinearGradient(0, 0.05, 0, 0.3);
    g.addColorStop(0, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-2, 0, 4, 0.3);
  });
  inRegion(ctx, 'rear', () => {
    for (const o of art.rearPanels) fillPoly(ctx, o, '#121315');
    for (const o of [taillight.outline, mirrorX(taillight.outline)]) fillPoly(ctx, grow(o, 0.012), BLACK);
  });
  inRegion(ctx, 'top', () => {
    for (const v of art.bonnetVents) {
      const o: Outline = v.map(([x, z]) => [z, x] as const);
      fillPoly(ctx, grow(o, 0.01), '#26282c');
      fillPoly(ctx, o, '#0e0f11');
      ctx.save();
      poly(ctx, o);
      ctx.clip();
      ctx.strokeStyle = '#26292d';
      ctx.lineWidth = 0.01;
      const zs = o.map((p) => p[0]);
      for (let z = Math.min(...zs); z < Math.max(...zs); z += 0.04) { ctx.beginPath(); ctx.moveTo(z, -1); ctx.lineTo(z, 1); ctx.stroke(); }
      ctx.restore();
    }
  });
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

function drawShutLines(ctx: Ctx, s: LiveryShape): void {
  const p = s.profile;
  const line = 'rgba(0,0,0,0.55)';
  for (const r of SIDES) inRegion(ctx, r, () => {
    guardOutlet(ctx, p.art.door[0][0]);
    poly(ctx, p.art.door);
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.006;
    ctx.stroke();
    ctx.fillStyle = '#141517';
    ctx.fillRect(-3, -0.2, 6, 0.36);
    const rearTop = p.art.door[2];
    roundRect(ctx, rearTop[0] + 0.16, rearTop[1] - 0.07, 0.13, 0.03, 0.012, 'rgba(10,10,12,0.75)');
    const g = ctx.createLinearGradient(0, 0.08, 0, 0.34);
    g.addColorStop(0, 'rgba(0,0,0,0.38)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-3, 0, 6, 0.34);
  });
  inRegion(ctx, 'top', () => {
    ctx.strokeStyle = line;
    ctx.lineWidth = 0.006;
    const zc = p.z.cowl + 0.05;
    const zb = p.z.rearGlassBase - 0.05;
    ctx.beginPath();
    ctx.moveTo(s.zFront - 0.05, -0.74); ctx.lineTo(zc, -0.74); ctx.lineTo(zc, 0.74); ctx.lineTo(s.zFront - 0.05, 0.74);
    ctx.moveTo(s.zRear + 0.04, -0.78); ctx.lineTo(zb, -0.78); ctx.lineTo(zb, 0.78); ctx.lineTo(s.zRear + 0.04, 0.78);
    ctx.stroke();
  });
}

function drawNumbers(ctx: Ctx, l: Livery, s: LiveryShape): void {
  const p = s.profile;
  const panel = luminance(l.primary) > 0.7 ? 0x1b1c1e : 0xf1f1ee;
  const digits = luminance(panel) > 0.5 ? (luminance(l.primary) < 0.45 ? hex(l.primary) : '#111214') : '#f4f4f0';
  const num = String(l.number);
  const d = p.art.door;
  const zc = (d[0][0] + d[2][0]) / 2 + 0.05;
  for (const r of SIDES) {
    // Number board above the door sponsor strip; the banner text runs along the sill.
    inRegion(ctx, r, () => roundRect(ctx, zc, 0.6, 0.5, 0.38, 0.05, hex(panel)));
    worldText(ctx, r, num, zc, 0.6, 0.33, 0.44, digits);
    worldText(ctx, r, l.banner, zc + 0.05, 0.158, 0.045, 0.9, '#f4f4f0', 800);
  }
  const zRoof = (p.z.roofFront + p.z.roofRear) / 2;
  const roofLen = Math.min(0.62, p.z.roofFront - p.z.roofRear - 0.08);
  inRegion(ctx, 'top', () => roundRect(ctx, zRoof, 0, roofLen, 0.62, 0.06, hex(panel)));
  worldText(ctx, 'top', num, zRoof, 0, 0.5, roofLen * 0.88, digits);
  worldText(ctx, 'front', l.banner, 0, 0.115, 0.05, 0.5, contrastOn(l.primary), 800);
}

/** Paints the whole livery atlas (call again to repaint after damage reset). */
export function paintLivery(ctx: Ctx, l: Livery, s: LiveryShape): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = hex(l.primary);
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawPattern(ctx, l, s);
  drawShutLines(ctx, s);
  drawFascia(ctx, s);
  drawSponsors(ctx, l, s);
  drawNumbers(ctx, l, s);
}
