import trackJson from '@/track/data/mount-panorama.json';
import { computeSides, type OsmSides, type SideArrays } from '@/track/apply-layout';
import { CORNERS, NAMED_PLACES } from '@/track/layout';

export type { SideArrays } from '@/track/apply-layout';

export interface TrackSource {
  meta: { lengthM: number; elevationBaseM: number; elevationMinM: number; elevationMaxM: number; finishLineS?: number; startLineS?: number };
  points: number[][];
  sections: Array<{ name: string; startIndex: number }>;
  sides?: OsmSides;
}

/**
 * Sampled closed-loop circuit. Frame per sample: centre position, unit tangent
 * (3D), unit LEFT normal (horizontal), crossfall. Lateral offset d > 0 = left.
 */
export class Track {
  readonly n: number;
  readonly length: number;
  readonly spacing: number;
  /** Timing (finish) line: laps and sectors are measured from here. */
  readonly startLineS: number;
  /** Standing-start line: the grid sits behind it. */
  readonly gridLineS: number;
  readonly elevationBaseM: number;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly pz: Float32Array;
  readonly tx: Float32Array;
  readonly ty: Float32Array;
  readonly tz: Float32Array;
  readonly lx: Float32Array;
  readonly lz: Float32Array;
  /** Signed horizontal curvature (1/m), + = left turn. */
  readonly curvature: Float32Array;
  /** Longitudinal grade dy/ds. */
  readonly grade: Float32Array;
  readonly bank: Float32Array;
  readonly left: SideArrays;
  readonly right: SideArrays;
  readonly places: ReadonlyArray<{ s: number; name: string }>;
  readonly corners = CORNERS;
  private readonly grid = new Map<number, number[]>();
  private static readonly CELL = 40;

  constructor(src: TrackSource = trackJson as TrackSource) {
    const pts = src.points;
    const n = pts.length;
    this.n = n;
    this.length = src.meta.lengthM;
    this.spacing = this.length / n;
    this.startLineS = src.meta.finishLineS ?? 92;
    this.gridLineS = src.meta.startLineS ?? 245;
    this.elevationBaseM = src.meta.elevationBaseM;
    this.places = NAMED_PLACES;
    const f = () => new Float32Array(n);
    this.px = f(); this.py = f(); this.pz = f();
    this.tx = f(); this.ty = f(); this.tz = f();
    this.lx = f(); this.lz = f();
    this.curvature = f(); this.grade = f();
    for (let i = 0; i < n; i++) {
      this.px[i] = pts[i][0];
      this.py[i] = pts[i][1];
      this.pz[i] = pts[i][2];
    }
    for (let i = 0; i < n; i++) {
      const a = (i - 1 + n) % n, b = (i + 1) % n;
      const dx = this.px[b] - this.px[a], dy = this.py[b] - this.py[a], dz = this.pz[b] - this.pz[a];
      const len = Math.hypot(dx, dy, dz);
      this.tx[i] = dx / len; this.ty[i] = dy / len; this.tz[i] = dz / len;
      const h = Math.hypot(dx, dz);
      // left = up x tangent (horizontal): (tz, 0, -tx) normalised
      this.lx[i] = dz / h;
      this.lz[i] = -dx / h;
      this.grade[i] = dy / h;
    }
    const k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = (i - 2 + n) % n, b = (i + 2) % n;
      const h1 = Math.atan2(this.px[i] - this.px[a], this.pz[i] - this.pz[a]);
      const h2 = Math.atan2(this.px[b] - this.px[i], this.pz[b] - this.pz[i]);
      let dh = h2 - h1;
      if (dh > Math.PI) dh -= 2 * Math.PI;
      if (dh < -Math.PI) dh += 2 * Math.PI;
      k[i] = dh / (2 * this.spacing);
    }
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let j = -2; j <= 2; j++) acc += k[(i + j + n) % n];
      this.curvature[i] = acc / 5;
    }
    const sides = computeSides(n, this.spacing, this.length, src.sides);
    this.left = sides.left;
    this.right = sides.right;
    this.bank = sides.bank;
    this.buildGrid();
  }

  private buildGrid(): void {
    for (let i = 0; i < this.n; i++) {
      const key = this.cellKey(this.px[i], this.pz[i]);
      const list = this.grid.get(key);
      if (list) list.push(i);
      else this.grid.set(key, [i]);
    }
  }

  private cellKey(x: number, z: number): number {
    return Math.floor(x / Track.CELL) * 100003 + Math.floor(z / Track.CELL);
  }

  /** Wraps a sample index into [0, n). */
  wrap(i: number): number {
    return ((i % this.n) + this.n) % this.n;
  }

  /** Wraps a distance into [0, length). */
  wrapS(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }

  /** Nearest sample index to a world point (global search via the spatial grid). */
  nearestIndex(x: number, z: number): number {
    let best = -1, bestD = Infinity;
    const cx = Math.floor(x / Track.CELL), cz = Math.floor(z / Track.CELL);
    for (let r = 1; r <= 8 && best < 0; r++) {
      for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
        const list = this.grid.get(gx * 100003 + gz);
        if (!list) continue;
        for (const i of list) {
          const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
    }
    if (best >= 0) return best;
    for (let i = 0; i < this.n; i++) {
      const d = (this.px[i] - x) ** 2 + (this.pz[i] - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /** Name of the place at distance s. */
  placeAt(s: number): string {
    const w = this.wrapS(s);
    let name = this.places[0].name;
    for (const p of this.places) if (p.s <= w) name = p.name;
    return name;
  }

  /** Lap progress 0..1 measured from the start/finish line. */
  lapFraction(s: number): number {
    return this.wrapS(s - this.startLineS) / this.length;
  }
}
