// Layout of the livery atlas (one canvas per car). Shared by the body UV
// mapping and the canvas painter so that both agree on where things land.
//
//  +--------------------------------------+  v_local 0 (canvas top)
//  | left side   (z runs front -> rear)   |
//  | right side  (z runs rear -> front)   |
//  | top view    (z front -> rear, x)     |
//  | front view (x, y)  | rear view (x,y) |
//  +--------------------------------------+
export type AtlasRegion = 'sideL' | 'sideR' | 'top' | 'front' | 'rear';

interface Rect { x: number; y: number; w: number; h: number }

export const ATLAS_RECTS: Record<AtlasRegion, Rect> = {
  sideL: { x: 0, y: 0, w: 1, h: 0.25 },
  sideR: { x: 0, y: 0.25, w: 1, h: 0.25 },
  top: { x: 0, y: 0.5, w: 1, h: 0.2 },
  front: { x: 0, y: 0.7, w: 0.5, h: 0.3 },
  rear: { x: 0.5, y: 0.7, w: 0.5, h: 0.3 },
};

/** World ranges (metres) covered by each region. */
export const ATLAS_RANGE = {
  z: [-2.7, 2.7] as const,
  sideY: [0, 1.3] as const,
  topX: [-1.05, 1.05] as const,
  faceX: [-1.05, 1.05] as const,
  faceY: [0.0, 1.15] as const,
};

/**
 * Local (0..1, canvas-down) coordinates of a world point in a region. The two
 * world coordinates are: sides (z, y), top (z, x), front/rear (x, y).
 */
export function regionLocal(region: AtlasRegion, a: number, b: number): [number, number] {
  const R = ATLAS_RANGE;
  const zs = R.z[1] - R.z[0];
  switch (region) {
    case 'sideL': return [(R.z[1] - a) / zs, (R.sideY[1] - b) / (R.sideY[1] - R.sideY[0])];
    case 'sideR': return [(a - R.z[0]) / zs, (R.sideY[1] - b) / (R.sideY[1] - R.sideY[0])];
    case 'top': return [(R.z[1] - a) / zs, (b - R.topX[0]) / (R.topX[1] - R.topX[0])];
    case 'front': return [(a - R.faceX[0]) / (R.faceX[1] - R.faceX[0]), (R.faceY[1] - b) / (R.faceY[1] - R.faceY[0])];
    case 'rear': return [(R.faceX[1] - a) / (R.faceX[1] - R.faceX[0]), (R.faceY[1] - b) / (R.faceY[1] - R.faceY[0])];
  }
}

/** Texture UV (three.js, flipY) of a world point in a region. */
export function regionUV(region: AtlasRegion, a: number, b: number): [number, number] {
  const r = ATLAS_RECTS[region];
  const [lu, lv] = regionLocal(region, a, b);
  return [r.x + lu * r.w, 1 - (r.y + lv * r.h)];
}

/** Canvas pixel of a world point in a region. */
export function regionPixel(region: AtlasRegion, a: number, b: number, width: number, height: number): [number, number] {
  const r = ATLAS_RECTS[region];
  const [lu, lv] = regionLocal(region, a, b);
  return [(r.x + lu * r.w) * width, (r.y + lv * r.h) * height];
}

/** World coordinates of a vertex used by each region. */
export function regionCoords(region: AtlasRegion, x: number, y: number, z: number): [number, number] {
  if (region === 'sideL' || region === 'sideR') return [z, y];
  if (region === 'top') return [z, x];
  return [x, y];
}
