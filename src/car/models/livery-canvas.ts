// Low-level drawing on the livery atlas in world units (metres). Each region
// maps world coordinates to canvas pixels with a separable affine transform.
import { ATLAS_RECTS, regionPixel, type AtlasRegion } from '@/car/models/livery-layout';
import type { Outline } from '@/car/models/profile-types';

export type Ctx = CanvasRenderingContext2D;

export const FONT_STACK = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", Impact, sans-serif';

export interface Affine { sx: number; sy: number; tx: number; ty: number }

export function regionAffine(region: AtlasRegion, w: number, h: number): Affine {
  const [x0, y0] = regionPixel(region, 0, 0, w, h);
  const [x1, y1] = regionPixel(region, 1, 1, w, h);
  return { sx: x1 - x0, sy: y1 - y0, tx: x0, ty: y0 };
}

/** Runs `fn` with the context clipped to `region` and transformed to its world units. */
export function inRegion(ctx: Ctx, region: AtlasRegion, fn: (a: Affine) => void): void {
  const { width: w, height: h } = ctx.canvas;
  const r = ATLAS_RECTS[region];
  const a = regionAffine(region, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x * w, r.y * h, r.w * w, r.h * h);
  ctx.clip();
  ctx.setTransform(a.sx, 0, 0, a.sy, a.tx, a.ty);
  fn(a);
  ctx.restore();
}

export function poly(ctx: Ctx, pts: Outline): void {
  ctx.beginPath();
  pts.forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b)));
  ctx.closePath();
}

export function fillPoly(ctx: Ctx, pts: Outline, colour: string): void {
  poly(ctx, pts);
  ctx.fillStyle = colour;
  ctx.fill();
}

/** Grows an outline about its centroid by `d` metres (approximate offset). */
export function grow(pts: Outline, d: number): Outline {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([a, b]) => {
    const dx = a - cx, dy = b - cy;
    const l = Math.hypot(dx, dy) || 1;
    return [a + (dx / l) * d, b + (dy / l) * d] as const;
  });
}

export const mirrorX = (pts: Outline): Outline => pts.map(([a, b]) => [-a, b] as const);

/**
 * Upright, unmirrored text centred at world (a, b) of a region, `height` metres
 * tall, squeezed to at most `maxWidth` metres.
 */
export function worldText(ctx: Ctx, region: AtlasRegion, text: string, a: number, b: number, height: number, maxWidth: number, colour: string, weight = 700): void {
  const { width: w, height: h } = ctx.canvas;
  const r = ATLAS_RECTS[region];
  const aff = regionAffine(region, w, h);
  const K = 100;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x * w, r.y * h, r.w * w, r.h * h);
  ctx.clip();
  ctx.translate(aff.sx * a + aff.tx, aff.sy * b + aff.ty);
  // Top region: text runs along -z (canvas x) with its up towards -x (canvas up).
  ctx.scale(Math.abs(aff.sx) / K, Math.abs(aff.sy) / K);
  ctx.font = `${weight} ${height * K * 1.32}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const m = ctx.measureText(text).width;
  const squeeze = Math.min(1, (maxWidth * K) / Math.max(1, m));
  ctx.scale(squeeze, 1);
  ctx.fillStyle = colour;
  ctx.fillText(text, 0, height * K * 0.06);
  ctx.restore();
}

/** Rounded rectangle centred at (a, b) in world units (call inside inRegion). */
export function roundRect(ctx: Ctx, a: number, b: number, wA: number, hB: number, rad: number, colour: string): void {
  ctx.beginPath();
  ctx.roundRect(a - wA / 2, b - hB / 2, wA, hB, rad);
  ctx.fillStyle = colour;
  ctx.fill();
}

export function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** Relative luminance (sRGB approx) of a hex colour, 0..1. */
export function luminance(c: number): number {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads best on `bg`. */
export function contrastOn(bg: number): string {
  return luminance(bg) > 0.55 ? '#111214' : '#f4f4f0';
}
