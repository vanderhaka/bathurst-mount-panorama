// Made-up sponsor decals for the livery atlas, broadcast style: a primary
// sponsor on the bonnet and both doors, smaller panels on the front guards,
// rear quarters, rear bumper and roof edges. The brands are the same fictional
// ones as the trackside boards (src/world/scenery/billboards.ts) so the world
// stays consistent; no real brands or logos.
//
// Text is drawn with an explicit canvas-space orientation per placement, so it
// is never mirrored on the car (each atlas region maps onto the body without a
// flip; see livery-layout.ts):
//   sides, front, rear: reading direction canvas +x, up canvas -y;
//   top: canvas +x runs front -> rear and canvas +y runs to the car's left.
import type { Livery } from '@/types/car-model';
import { ATLAS_RECTS, regionPixel, type AtlasRegion } from '@/car/models/livery-layout';
import { SPONSORS as WORLD_SPONSORS, type Sponsor } from '@/art/sponsors';
import { regionAffine, FONT_STACK, type Ctx } from '@/car/models/livery-canvas';

export type { Sponsor };

/** The world's fictional brands (src/art/sponsors.ts), with the short tags that fit on a car. */
export const SPONSORS: readonly Sponsor[] = WORLD_SPONSORS.map((sp) => ({ ...sp, tag: sp.shortTag ?? sp.tag }));

/** Salt chosen so that the eight preset liveries all get a different main sponsor. */
const SALT = 730;

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Index of the main sponsor of a livery (from its banner and number). */
export function mainSponsor(l: Livery): number {
  return hash(`${l.banner}#${l.number}#${SALT}`) % SPONSORS.length;
}

/** The k-th associate sponsor after the main one (3 is coprime with 8: all brands appear). */
export function associate(main: number, k: number): Sponsor {
  return SPONSORS[(main + 3 * k) % SPONSORS.length];
}

/** Canvas-space reading direction of a decal. */
export type Facing = 'canvas' | 'fromFront' | 'leftEdge' | 'rightEdge';

/** Canvas unit vectors (reading direction u, glyph-up v) for each facing. */
const AXES: Record<Facing, { u: readonly [number, number]; v: readonly [number, number] }> = {
  canvas: { u: [1, 0], v: [0, -1] },
  // Top region, read by someone standing in front of the car: text runs to the car's left (+canvas y), up towards the rear (+canvas x).
  fromFront: { u: [0, 1], v: [1, 0] },
  // Top region, roof edges read from beside the car: up points to the car's centreline.
  leftEdge: { u: [1, 0], v: [0, -1] },
  rightEdge: { u: [-1, 0], v: [0, 1] },
};

export interface DecalSpec {
  region: AtlasRegion;
  /** World coordinates of the centre in the region's axes (see regionCoords). */
  a: number;
  b: number;
  /** Size along the text and across it (m). */
  len: number;
  hgt: number;
  facing: Facing;
  sponsor: Sponsor;
  /** 'stack': name above tag (bonnet); 'line': name and tag on one line; 'name': name only. */
  style: 'stack' | 'line' | 'name';
}

const K = 100; // local units: centimetres (canvas fonts dislike sub-pixel sizes)

function fitText(ctx: Ctx, text: string, x: number, y: number, size: number, maxW: number, colour: string): void {
  ctx.font = `800 ${size * 1.3}px ${FONT_STACK}`;
  const w = ctx.measureText(text).width;
  const k = Math.min(1, maxW / Math.max(1, w));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, 1);
  ctx.fillStyle = colour;
  ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
}

/** Paints one sponsor decal (block, border and text) into the atlas. */
export function paintDecal(ctx: Ctx, d: DecalSpec): void {
  const { width: w, height: h } = ctx.canvas;
  const r = ATLAS_RECTS[d.region];
  const aff = regionAffine(d.region, w, h);
  const kx = Math.abs(aff.sx) / K;
  const ky = Math.abs(aff.sy) / K;
  const { u, v } = AXES[d.facing];
  const [cx, cy] = regionPixel(d.region, d.a, d.b, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x * w, r.y * h, r.w * w, r.h * h);
  ctx.clip();
  // Local x = along the text, local y = down the glyphs (= -v).
  ctx.setTransform(u[0] * kx, u[1] * ky, -v[0] * kx, -v[1] * ky, cx, cy);
  const L = d.len * K, H = d.hgt * K, s = d.sponsor;
  ctx.beginPath();
  ctx.roundRect(-L / 2, -H / 2, L, H, Math.min(H, L) * 0.18);
  ctx.fillStyle = s.bg;
  ctx.fill();
  ctx.lineWidth = Math.max(0.6, H * 0.06);
  ctx.strokeStyle = s.accent;
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const inner = L * 0.9;
  if (d.style === 'stack') {
    fitText(ctx, s.name, 0, -H * 0.13, H * 0.5, inner, s.fg);
    fitText(ctx, s.tag, 0, H * 0.3, H * 0.24, inner * 0.8, s.accent === s.bg ? s.fg : s.accent);
  } else if (d.style === 'line') {
    fitText(ctx, `${s.name} ${s.tag}`, 0, 0, H * 0.66, inner, s.fg);
  } else {
    fitText(ctx, s.name, 0, 0, H * 0.66, inner, s.fg);
  }
  ctx.restore();
}
