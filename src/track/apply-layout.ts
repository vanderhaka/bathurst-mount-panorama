import { CATCH_FENCES, TYRE_WALLS, WIDTH_KEYS, type BarrierKind, type VergeSurface, type WidthKey } from '@/track/layout';

/** Raw per-sample OSM data from scripts/build-features.mjs (-1 / 0 = none). */
export interface OsmSides {
  wallL: number[];
  wallR: number[];
  fenceL: number[];
  fenceR: number[];
  sandL: number[];
  sandR: number[];
}

export interface SideArrays {
  /** Lateral distance from the centreline to the road edge (m, positive). */
  edge: Float32Array;
  /** Lateral distance from the centreline to the first barrier contact face (m, positive). */
  wall: Float32Array;
  surface: VergeSurface[];
  barrier: BarrierKind[];
  fence: Uint8Array;
}

/** Depth of a belt-covered tyre wall in front of the concrete (m). */
export const TYRE_WALL_DEPTH = 1.0;
const MIN_VERGE = 0.7;

function keyAt(s: number, L: number): { a: WidthKey; b: WidthKey; t: number } {
  let ki = WIDTH_KEYS.length - 1;
  for (let k = 0; k < WIDTH_KEYS.length; k++) if (WIDTH_KEYS[k].s <= s) ki = k;
  const a = WIDTH_KEYS[ki], b = WIDTH_KEYS[(ki + 1) % WIDTH_KEYS.length];
  const span = ((b.s - a.s + L) % L) || L;
  const t0 = ((s - a.s + L) % L) / span;
  return { a, b, t: t0 * t0 * (3 - 2 * t0) };
}

const inRange = (s: number, from: number, to: number) => s >= from && s <= to;

function cleanOsm(raw: number[], minValid: number): Float32Array {
  const n = raw.length;
  const out = new Float32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const win: number[] = [];
    for (let k = -2; k <= 2; k++) {
      const v = raw[(i + k + n) % n];
      if (v >= minValid) win.push(v);
    }
    if (win.length >= 3) out[i] = win.sort((x, y) => x - y)[Math.floor(win.length / 2)];
  }
  return out;
}

function smooth(arr: Float32Array, radius: number): Float32Array {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) acc += arr[(i + k + n) % n];
    out[i] = acc / (2 * radius + 1);
  }
  return out;
}

/** Combines paved widths, real OSM barriers and sand traps into per-side arrays. */
export function computeSides(n: number, spacing: number, length: number, osm: OsmSides | undefined): { left: SideArrays; right: SideArrays; bank: Float32Array } {
  const mk = (): SideArrays => ({ edge: new Float32Array(n), wall: new Float32Array(n), surface: new Array(n), barrier: new Array(n), fence: new Uint8Array(n) });
  const left = mk(), right = mk();
  const bank = new Float32Array(n);
  const half = new Float32Array(n);
  const barrierL = new Float32Array(n), barrierR = new Float32Array(n);
  const osmL = osm ? cleanOsm(osm.wallL, 3) : new Float32Array(n).fill(-1);
  const osmR = osm ? cleanOsm(osm.wallR, 3) : new Float32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const s = i * spacing;
    const { a, b, t } = keyAt(s, length);
    const mix = (x: number, y: number) => x + (y - x) * t;
    half[i] = mix(a.width, b.width) / 2;
    bank[i] = mix(a.bank, b.bank);
    const held = t < 0.5 ? a : b;
    for (const [side, osmW, sand, fallback, barrierArr, surf] of [
      [left, osmL, osm?.sandL[i] ?? 0, mix(a.vergeL, b.vergeL), barrierL, held.surfaceL],
      [right, osmR, osm?.sandR[i] ?? 0, mix(a.vergeR, b.vergeR), barrierR, held.surfaceR],
    ] as const) {
      const w = osmW[i];
      let B: number;
      if (sand > half[i] + 1) B = Math.min(75, Math.max(sand + 1.0, w));
      else if (w > 0) B = w;
      else B = half[i] + fallback;
      barrierArr[i] = Math.max(B, half[i] * 0.6 + MIN_VERGE);
      side.surface[i] = sand > half[i] + 1 ? 'gravel' : surf ?? 'grass';
    }
  }
  const bl = smooth(barrierL, 2), br = smooth(barrierR, 2);
  for (let i = 0; i < n; i++) {
    const s = i * spacing;
    // Road edges: keep the paved width, shifting it towards the side with room.
    let eL = Math.min(half[i], bl[i] - MIN_VERGE);
    let eR = Math.min(half[i], br[i] - MIN_VERGE);
    eL = Math.min(bl[i] - MIN_VERGE, eL + (half[i] - eR));
    eR = Math.min(br[i] - MIN_VERGE, eR + (half[i] - eL));
    left.edge[i] = Math.max(2.5, eL);
    right.edge[i] = Math.max(2.5, eR);
    for (const [side, B, sign] of [[left, bl[i], 1], [right, br[i], -1]] as const) {
      const tyres = TYRE_WALLS.some((r) => r.side === sign && inRange(s, r.from, r.to));
      side.barrier[i] = tyres ? 'tyres' : 'concrete';
      side.wall[i] = Math.max(side.edge[i] + 0.4, B - (tyres ? TYRE_WALL_DEPTH : 0));
      const osmFence = osm ? (sign > 0 ? osm.fenceL[i] : osm.fenceR[i]) > 0 : false;
      side.fence[i] = osmFence || CATCH_FENCES.some((r) => r.side === sign && inRange(s, r.from, r.to)) ? 1 : 0;
    }
  }
  return { left, right, bank };
}
