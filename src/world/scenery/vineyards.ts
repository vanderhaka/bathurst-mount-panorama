import * as THREE from 'three';
import featuresJson from '@/track/data/features.json';
import { linearColour, vertexColourMaterial } from '@/art/materials';
import type { Terrain } from '@/world/terrain';
import { orientedBox, pointInPolygon, type SpatialMask, type XZ } from '@/world/scenery/geo';

const F = featuresJson as unknown as { vineyards: Array<{ kind: string; poly: XZ[] }> };

/** Row spacing, row width and height (m) for vines and for orchard trees. */
const STYLE = {
  vineyard: { gap: 3.2, width: 0.5, height: 0.9, colour: linearColour(0x7c8c4a), top: linearColour(0x93a259) },
  orchard: { gap: 6, width: 2.2, height: 2.6, colour: linearColour(0x5b6e3c), top: linearColour(0x6d8246) },
} as const;
const PIECE = 16; // rows are split into pieces of this length (m) so that they follow the ground

/**
 * The mapped vineyards and orchard below the Mountain Straight: rows of vines or
 * fruit trees as low hedge ribbons (one merged mesh, a few thousand triangles).
 */
export function buildVineyards(terrain: Terrain, mask: SpatialMask): THREE.Mesh | null {
  const pos: number[] = [], col: number[] = [];
  for (const v of F.vineyards) {
    const style = v.kind === 'orchard' ? STYLE.orchard : STYLE.vineyard;
    const box = orientedBox(v.poly);
    const ux = Math.cos(box.angle), uz = Math.sin(box.angle); // along the rows (long axis)
    const wx = -uz, wz = ux;
    const L = box.length / 2 + 5, W = box.width / 2 + 5;
    for (let w = -W; w <= W; w += style.gap) {
      let run: XZ | null = null;
      for (let u = -L; u <= L + 0.01; u += 2) {
        const x = box.cx + ux * u + wx * w, z = box.cz + uz * u + wz * w;
        const inside = pointInPolygon(x, z, v.poly) && u < L;
        if (inside && !run) run = [x, z];
        const len = run ? Math.hypot(x - run[0], z - run[1]) : 0;
        if (run && (!inside || len >= PIECE)) {
          ribbon(pos, col, terrain, run, [x, z], style);
          run = inside ? [x, z] : null;
        }
        if (inside) mask.add(x, z, 2);
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Foliage rows are lit like the ground they cover (normals up), not like walls in their own shade.
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const mesh = new THREE.Mesh(geo, vertexColourMaterial({ roughness: 0.95, flat: false }));
  mesh.name = 'vineyards';
  // Low rows 3 m apart would shade each other almost black; they only receive shadows.
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

type Style = (typeof STYLE)[keyof typeof STYLE];

/**
 * One row piece: a closed prism (two sloped sides, flat top, two end caps; 10 triangles),
 * wound outward so that only front faces are drawn. Normals point up, so the foliage is lit
 * like the ground it covers.
 */
function ribbon(pos: number[], col: number[], terrain: Terrain, a: XZ, b: XZ, s: Style): void {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  const nx = (-dz / l) * (s.width / 2), nz = (dx / l) * (s.width / 2);
  const ya = terrain.heightAt(a[0], a[1]) - 0.1, yb = terrain.heightAt(b[0], b[1]) - 0.1;
  const P = (p: XZ, y: number, k: number, h: number): number[] => [p[0] + nx * k, y + h, p[1] + nz * k];
  const top = s.height;
  // Corners: base left/right and top left/right at each end (k = +1 left, -1 right).
  const aBL = P(a, ya, 1, 0), aBR = P(a, ya, -1, 0), aTL = P(a, ya, 0.5, top), aTR = P(a, ya, -0.5, top);
  const bBL = P(b, yb, 1, 0), bBR = P(b, yb, -1, 0), bTL = P(b, yb, 0.5, top), bTR = P(b, yb, -0.5, top);
  const tri = (p: number[], q: number[], r: number[], c: THREE.Color) => {
    // Wind each triangle so that its geometric normal faces away from the row axis or up.
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const cx = (p[0] + q[0] + r[0]) / 3 - (a[0] + b[0]) / 2, cy = (p[1] + q[1] + r[1]) / 3 - ((ya + yb) / 2 + top * 0.4), cz = (p[2] + q[2] + r[2]) / 3 - (a[1] + b[1]) / 2;
    const out = n[0] * cx + n[1] * cy + n[2] * cz > 0;
    pos.push(...p, ...(out ? q : r), ...(out ? r : q));
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  const quad = (p: number[], q: number[], r: number[], t: number[], c: THREE.Color) => { tri(p, q, r, c); tri(p, r, t, c); };
  quad(aBL, bBL, bTL, aTL, s.colour);
  quad(aBR, aTR, bTR, bBR, s.colour);
  quad(aTL, bTL, bTR, aTR, s.top);
  quad(aBL, aTL, aTR, aBR, s.colour);
  quad(bBL, bBR, bTR, bTL, s.colour);
}
