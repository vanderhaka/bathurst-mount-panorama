// Assigns every quad of the body grid a material (paint / glass / dark) and a
// livery-atlas region, and marks the hard creases used for split normals.
import { ROW_MAIN, ROW_NOSE, ROW_TAIL, type BodyGrid } from '@/car/models/body-grid';
import { CP } from '@/car/models/body-section';
import type { AtlasRegion } from '@/car/models/livery-layout';

export const MAT_PAINT = 0;
export const MAT_GLASS = 1;
export const MAT_DARK = 2;

export const GLASS_NONE = 0;
export const GLASS_SIDE = 1;
export const GLASS_FRONT = 2;
export const GLASS_REAR = 3;

export const REGIONS: readonly AtlasRegion[] = ['sideL', 'sideR', 'top', 'front', 'rear'];

export interface QuadInfo {
  /** Quads per row (= cols - 1). */
  qc: number;
  mat: Uint8Array;
  region: Uint8Array;
  glass: Uint8Array;
  /** Row kind of each quad (tail cap / main / nose cap). */
  kind: Uint8Array;
  /** Half-ring index of the quad's lower column (0 = bottom centre). */
  half: Uint16Array;
  /** Half-ring indices whose column lines are hard creases in main rows. */
  creases: Set<number>;
}

export function halfIndexOfQuad(grid: BodyGrid, c: number): number {
  return c < grid.n ? c : 2 * grid.n - c - 1;
}

export function classifyQuads(grid: BodyGrid): QuadInfo {
  const cp = grid.layout.cpIndex;
  const qc = grid.cols - 1;
  const total = (grid.rows - 1) * qc;
  const info: QuadInfo = {
    qc,
    mat: new Uint8Array(total),
    region: new Uint8Array(total),
    glass: new Uint8Array(total),
    kind: new Uint8Array(total),
    half: new Uint16Array(total),
    creases: new Set([cp[CP.BW], cp[CP.BA], cp[CP.SA], cp[CP.S0], ...(grid.sideCrease ? [cp[CP.S2]] : []), cp[CP.S3]]),
  };
  const at = grid.rowAt;
  for (let r = 0; r < grid.rows - 1; r++) {
    const kind = grid.rowKind[r] === ROW_TAIL ? ROW_TAIL : grid.rowKind[r + 1] === ROW_NOSE ? ROW_NOSE : ROW_MAIN;
    for (let c = 0; c < qc; c++) {
      const q = r * qc + c;
      const left = c < grid.n;
      const h = halfIndexOfQuad(grid, c);
      info.kind[q] = kind;
      info.half[q] = h;
      if (kind !== ROW_MAIN) {
        info.region[q] = kind === ROW_NOSE ? 3 : 4;
        continue;
      }
      if (h < cp[CP.S0]) { info.mat[q] = MAT_DARK; continue; }
      if (h < cp[CP.S3]) { info.region[q] = left ? 0 : 1; continue; }
      info.region[q] = 2;
      let g = GLASS_NONE;
      if (h >= cp[CP.G0] && h < cp[CP.G1] && r >= at.sideRear && r < at.sideFront) g = GLASS_SIDE;
      else if (h >= cp[CP.R0] && r >= at.roofFront && r < at.cowl) g = GLASS_FRONT;
      else if (h >= cp[CP.R1] && r >= at.rearGlassBase && r < at.roofRear) g = GLASS_REAR;
      if (g !== GLASS_NONE) { info.mat[q] = MAT_GLASS; info.glass[q] = g; }
    }
  }
  return info;
}

/** Is the column line c (between rows r and r+1) a hard crease? */
export function isHardColumn(grid: BodyGrid, info: QuadInfo, c: number, r: number): boolean {
  const q = r * info.qc + Math.min(c, info.qc - 1);
  if (info.kind[q] !== ROW_MAIN) return false;
  const h = c <= grid.n ? c : 2 * grid.n - c;
  return info.creases.has(h);
}
