import data from '@/track/data/gold-coast-environment.json';

export interface GoldCoastBuilding { x: number; z: number; levels: number; heightM: number | null; name: string | null; osmId: number }
export interface GoldCoastEnvironment {
  meta: { source: string; license: string; attribution: string; frame: string; simplifyToleranceM: number; extractedAt: string;
    box: { x0: number; z0: number; x1: number; z1: number } };
  /** Ocean coastline ordered north (low z) to south (high z). */
  coastline: [number, number][];
  /** Closed outer rings of inland water. */
  water: [number, number][][];
  /** Land inside the water rings (Macintosh Island, which carries the circuit). */
  waterHoles: [number, number][][];
  /** Ponds on the island (OSM relation 6067956 outer ring). */
  lakes: [number, number][][];
  buildings: GoldCoastBuilding[];
}

const pairs = (list: number[][]): [number, number][] => list.map(p => [p[0], p[1]]);
export const GOLD_COAST_ENV: GoldCoastEnvironment = { ...data, coastline: pairs(data.coastline), water: data.water.map(pairs), waterHoles: data.waterHoles.map(pairs), lakes: data.lakes.map(pairs) };

const box = (ring: [number, number][]) => ({ ring, x0: Math.min(...ring.map(p => p[0])), x1: Math.max(...ring.map(p => p[0])),
  z0: Math.min(...ring.map(p => p[1])), z1: Math.max(...ring.map(p => p[1])) });
const rings = GOLD_COAST_ENV.water.map(box), holes = GOLD_COAST_ENV.waterHoles.map(box), ponds = GOLD_COAST_ENV.lakes.map(box);

/** x of the ocean coastline at z (linear between nodes; the first or last segment is extended outside the range). */
export function coastXAt(z: number): number {
  const c = GOLD_COAST_ENV.coastline;
  let i = 1;
  while (i < c.length - 1 && c[i][1] < z) i++;
  const [ax, az] = c[i - 1], [bx, bz] = c[i];
  return ax + (bx - ax) * (z - az) / (bz - az);
}

export function inSea(x: number, z: number): boolean { return x > coastXAt(z); }

/** Even-odd containment in one ring; the bounding box rejects most points first. */
function within(r: ReturnType<typeof box>, x: number, z: number): boolean {
  if (x < r.x0 || x > r.x1 || z < r.z0 || z > r.z1) return false;
  let inside = false;
  for (let i = 0, j = r.ring.length - 1; i < r.ring.length; j = i++) {
    const [xi, zi] = r.ring[i], [xj, zj] = r.ring[j];
    if ((zi > z) !== (zj > z) && x < xi + (xj - xi) * (z - zi) / (zj - zi)) inside = !inside;
  }
  return inside;
}

/** Inside a water ring and outside every island hole, or inside a pond. */
export function inWater(x: number, z: number): boolean {
  return (rings.some(r => within(r, x, z)) && !holes.some(h => within(h, x, z))) || ponds.some(r => within(r, x, z));
}

/** Distance (m) from a point to the nearest water-ring edge; used for the shore blend. */
export function shoreDistance(x: number, z: number): number {
  let best = Infinity;
  for (const r of [...rings, ...holes, ...ponds]) {
    if (x < r.x0 - best || x > r.x1 + best || z < r.z0 - best || z > r.z1 + best) continue;
    for (let i = 0, j = r.ring.length - 1; i < r.ring.length; j = i++) {
      const [ax, az] = r.ring[j], dx = r.ring[i][0] - ax, dz = r.ring[i][1] - az, l2 = dx * dx + dz * dz;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
    }
  }
  return best;
}
