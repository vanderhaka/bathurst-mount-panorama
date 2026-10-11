// Canvas textures of one car: livery atlas, windscreen banner and dash display.
// Without a DOM (unit tests in node) no textures are made and the paint falls
// back to the livery's primary colour.
import * as THREE from 'three';
import type { DashState, Livery } from '@/types/car-model';
import { liveryNumber } from '@/car/liveries';
import { paintLivery, type LiveryShape } from '@/car/models/livery-paint';
import { contrastOn, FONT_STACK, hex, inRegion, type Ctx } from '@/car/models/livery-canvas';
import type { AtlasRegion } from '@/car/models/livery-layout';
import { resizeCanvasTexture } from '@/car/models/texture-quality';
import { CAR_SPECS } from '@/car/car-specs';
import { paintAnalogue } from '@/car/models/display-analogue';

export interface LiveryTextures {
  paint: THREE.CanvasTexture;
  banner: THREE.CanvasTexture;
  display: THREE.CanvasTexture;
  /** Resizes the live maps, retaining painted wear and all material references. */
  resize(width: number, height: number): void;
  /** Repaints the clean livery (damage reset). */
  repaint(): void;
  /** Scratches and scuffs the paint around world point (a, b) of a region. */
  scratch(region: AtlasRegion, a: number, b: number, severity: number, seed: number): void;
}

function canvas2d(w: number, h: number): Ctx | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c.getContext('2d');
}

function texture(ctx: Ctx, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(ctx.canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  return t;
}

function paintBanner(ctx: Ctx, l: Livery): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = hex(l.secondary);
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = hex(l.accent);
  ctx.fillRect(0, h * 0.88, w, h * 0.12);
  ctx.font = `800 ${h * 0.78}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = contrastOn(l.secondary);
  const text = l.banner.toUpperCase().split('').join(String.fromCharCode(8202));
  const m = ctx.measureText(text).width;
  ctx.save();
  ctx.translate(w / 2, h * 0.45);
  ctx.scale(Math.min(1, (w * 0.7) / m), 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.font = `800 ${h * 0.5}px ${FONT_STACK}`;
  ctx.fillText(liveryNumber(l), w * 0.93, h * 0.45);
}

function paintDisplay(ctx: Ctx): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, h);
  const leds = 12;
  for (let i = 0; i < leds; i++) {
    ctx.fillStyle = i < 5 ? '#27d04b' : i < 9 ? '#f2c230' : '#ff3b2f';
    ctx.beginPath();
    ctx.arc((w * (i + 0.5)) / leds, h * 0.1, h * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8f0ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${h * 0.55}px ${FONT_STACK}`;
  ctx.fillText('4', w / 2, h * 0.55);
  ctx.font = `600 ${h * 0.2}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText('2:05.84', w * 0.04, h * 0.42);
  ctx.fillText('+0.21', w * 0.04, h * 0.72);
  ctx.textAlign = 'right';
  ctx.fillText('187', w * 0.96, h * 0.42);
  ctx.fillStyle = '#7fd0ff';
  ctx.fillText('92°', w * 0.96, h * 0.72);
}

const TYRE_SIDEWALL = '#2a2a2c';

/**
 * Sidewall lettering for the slick (generic text, no brand). Lathe UVs: u runs
 * around the tyre, v along the profile (outer sidewall is v ~0.8..0.93).
 * The background is baked with `base`; see writeMaterials for live recolouring.
 * `plain`: a period sidewall, dark with a faint lighter ring and no lettering.
 */
export function createTyreTexture(base: number, plain = false): THREE.CanvasTexture | null {
  const ctx = canvas2d(1024, 256);
  if (!ctx) return null;
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = hex(base);
  ctx.fillRect(0, 0, w, h);
  // Sidewalls (either side of the tread, which sits at v ~0.4..0.6) a little lighter than the tread.
  ctx.fillStyle = TYRE_SIDEWALL;
  ctx.fillRect(0, 0, w, h * 0.4);
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  // Circumferential micro-groove hint on the slick tread (v mid-band).
  const treadY0 = h * 0.38, treadY1 = h * 0.62;
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 5; i++) {
    const y = treadY0 + ((i + 0.5) / 5) * (treadY1 - treadY0);
    ctx.fillRect(0, y, w, Math.max(1, h * 0.004));
  }
  // Soft moulding ring on the outer sidewall.
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(0, h * 0.12, w, h * 0.01);
  ctx.fillRect(0, h * 0.87, w, h * 0.01);
  const y0 = (1 - 0.925) * h;
  const y1 = (1 - 0.812) * h;
  if (plain) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, y0 + (y1 - y0) * 0.3, w, h * 0.012);
    const t = texture(ctx, 4);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  }
  ctx.font = `700 ${(y1 - y0) * 0.95}px ${FONT_STACK}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (const [u, text, colour] of [[0.25, 'RACING SLICK', '#e3c34a'], [0.75, '305/680 R18', '#e8e8e2']] as const) {
    ctx.save();
    ctx.translate(u * w, (y0 + y1) / 2);
    ctx.scale(1.6, 1);
    ctx.fillStyle = colour;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  const t = texture(ctx, 4);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Repaints the dash display with live values (cockpit view). */
export function paintDisplayLive(ctx: Ctx, d: DashState): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, h);
  const leds = 12;
  const lit = Math.round(Math.max(0, Math.min(1, d.shiftLights)) * leds);
  const flash = d.shiftLights >= 1 && Math.floor(performance.now() / 90) % 2 === 0;
  for (let i = 0; i < leds; i++) {
    const on = i < lit;
    ctx.fillStyle = !on ? '#151a20' : flash ? '#3aa0ff' : i < 5 ? '#27d04b' : i < 9 ? '#f2c230' : '#ff3b2f';
    ctx.beginPath();
    ctx.arc((w * (i + 0.5)) / leds, h * 0.1, h * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8f0ff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${h * 0.55}px ${FONT_STACK}`;
  ctx.fillText(d.gear < 0 ? 'R' : d.gear === 0 ? 'N' : String(d.gear), w / 2, h * 0.55);
  ctx.font = `600 ${h * 0.2}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  const lap = d.lapS === null ? '-:--.--' : `${Math.floor(d.lapS / 60)}:${(d.lapS % 60).toFixed(2).padStart(5, '0')}`;
  ctx.fillText(lap, w * 0.04, h * 0.42);
  if (d.deltaS !== null) {
    ctx.fillStyle = d.deltaS <= 0 ? '#33d17a' : '#ff4d3a';
    ctx.fillText(`${d.deltaS <= 0 ? '-' : '+'}${Math.abs(d.deltaS).toFixed(2)}`, w * 0.04, h * 0.72);
  }
  ctx.fillStyle = '#e8f0ff';
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.round(d.speedKmh)), w * 0.96, h * 0.42);
  ctx.fillStyle = '#7fd0ff';
  ctx.fillText(`${Math.round(d.waterTempC)}°`, w * 0.96, h * 0.72);
}

/** Ragged blob outline around (a, b) with half-sizes (ra, rb). */
function ragged(a: number, b: number, ra: number, rb: number, rand: () => number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const n = 14;
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const r = 0.65 + rand() * 0.45;
    pts.push([a + Math.cos(t) * ra * r, b + Math.sin(t) * rb * r]);
  }
  return pts;
}

/**
 * Impact scrape in world units (call inside inRegion): a primer-grey rim of
 * chipped paint, bare carbon weave in the middle, dark scuffing around it and
 * long scrape streaks along the car (sides) or across it (nose, tail, top).
 */
function paintScrape(ctx: Ctx, region: AtlasRegion, a: number, b: number, sev: number, rand: () => number): void {
  const along = region === 'sideL' || region === 'sideR' || region === 'top';
  const ra = (0.1 + sev * 0.32) * (along ? 1.4 : 1);
  const rb = 0.06 + sev * 0.16;
  // Dark scuff halo.
  const halo = ctx.createRadialGradient(a, b, 0, a, b, Math.max(ra, rb) * 1.5);
  halo.addColorStop(0, `rgba(18,18,20,${0.25 + sev * 0.45})`);
  halo.addColorStop(1, 'rgba(18,18,20,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(a - ra * 1.6, b - rb * 2.4, ra * 3.2, rb * 4.8);
  // Long scrape streaks.
  const streaks = Math.round(8 + sev * 30);
  for (let i = 0; i < streaks; i++) {
    const len = (0.12 + rand() * 0.45) * (0.6 + sev);
    const ca = a + (rand() - 0.5) * ra * 2.2;
    const cb = b + (rand() - 0.5) * rb * 2.6;
    const ang = (rand() - 0.5) * 0.25;
    ctx.strokeStyle = rand() < 0.6 ? `rgba(230,230,224,${0.45 + rand() * 0.45})` : `rgba(12,12,14,${0.5 + rand() * 0.4})`;
    ctx.lineWidth = 0.002 + rand() * 0.007;
    ctx.beginPath();
    ctx.moveTo(ca - (Math.cos(ang) * len) / 2, cb - (Math.sin(ang) * len) / 2);
    ctx.lineTo(ca + (Math.cos(ang) * len) / 2, cb + (Math.sin(ang) * len) / 2);
    ctx.stroke();
  }
  if (sev < 0.15) return;
  // Chipped paint (primer rim) and bare carbon.
  const outer = ragged(a, b, ra, rb, rand);
  ctx.beginPath();
  outer.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = '#a7a7a2';
  ctx.fill();
  const inner = outer.map(([x, y]) => [a + (x - a) * 0.82, b + (y - b) * 0.78] as [number, number]);
  ctx.save();
  ctx.beginPath();
  inner.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#16171a';
  ctx.fillRect(a - ra, b - rb, ra * 2, rb * 2);
  const cell = 0.014;
  ctx.fillStyle = '#2b2d31';
  for (let x = a - ra, i = 0; x < a + ra; x += cell, i++) {
    for (let y = b - rb, j = 0; y < b + rb; y += cell, j++) if ((i + j) % 2 === 0) ctx.fillRect(x, y, cell * 0.9, cell * 0.45);
  }
  ctx.restore();
}

/** Small deterministic random generator. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function createLiveryTextures(l: Livery, shape: LiveryShape, width: number, height: number): LiveryTextures | null {
  const ctx = canvas2d(width, height);
  // The sun strip is a thin band (about 13:1), so the canvas keeps that aspect.
  const bannerWidth = Math.min(1024, width);
  const bctx = canvas2d(bannerWidth, Math.round(bannerWidth * 80 / 1024));
  // Classic cockpit: two square gauge cells, so the canvas is twice as wide as high.
  const classic = shape.profile.cockpit === 'classic';
  const dctx = classic ? canvas2d(512, 256) : canvas2d(256, 128);
  if (!ctx || !bctx || !dctx) return null;
  paintLivery(ctx, l, shape);
  paintBanner(bctx, l);
  if (classic) paintAnalogue(dctx, CAR_SPECS[shape.kind].engine.redlineRpm, 0, 0);
  else paintDisplay(dctx);
  const paint = texture(ctx, 8);
  const banner = texture(bctx, 4);
  const display = texture(dctx, classic ? 4 : 1);
  const scars: Array<{ region: AtlasRegion; a: number; b: number; severity: number; seed: number }> = [];
  return {
    paint,
    banner,
    display,
    resize(width, height) {
      resizeCanvasTexture(paint, width, height, () => {
        paintLivery(ctx, l, shape);
        for (const scar of scars) inRegion(ctx, scar.region, () => paintScrape(ctx, scar.region, scar.a, scar.b, scar.severity, rng(scar.seed)));
      });
      const bannerWidth = Math.min(1024, width);
      resizeCanvasTexture(banner, bannerWidth, Math.round(bannerWidth * 80 / 1024), () => paintBanner(bctx, l));
    },
    repaint() {
      scars.length = 0;
      paintLivery(ctx, l, shape);
      paint.needsUpdate = true;
    },
    scratch(region, a, b, severity, seed) {
      scars.push({ region, a, b, severity, seed });
      inRegion(ctx, region, () => paintScrape(ctx, region, a, b, severity, rng(seed)));
      paint.needsUpdate = true;
    },
  };
}
