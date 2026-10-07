import * as THREE from 'three';
import type { Rng } from '@/props/core/rng';
import { crownCards } from '@/props/trees/gum-leaves';

// Gum crown: one connected, rounded-oval mass made of lumpy clusters packed around
// an envelope ellipsoid. Clusters overlap heavily, so the crown reads as one canopy
// with a ragged edge and only small gaps at the rim (neither one smooth ball nor
// separate pads on bare branches).

export interface Cluster {
  centre: THREE.Vector3;
  size: THREE.Vector3;
}

export interface CrownShape {
  centre: THREE.Vector3;
  /** Envelope half-sizes (x, y, z). */
  radii: THREE.Vector3;
}

/** Six intersecting leaf cards per near cluster. */
export const CLUSTER_TRIS = 12;

/**
 * Packs `count` clusters around the envelope: one core cluster, the rest on a
 * golden-angle spiral over the upper three-quarters of the ellipsoid at `reach`
 * of its radius, sized `size` of its radius (so their outer faces poke past the
 * envelope and make the silhouette ragged).
 */
export function planClusters(shape: CrownShape, count: number, size: [number, number], reach: [number, number], rng: Rng): Cluster[] {
  const { centre, radii } = shape;
  const out: Cluster[] = [];
  if (count <= 0) return out;
  out.push({ centre: centre.clone().add(new THREE.Vector3(0, radii.y * 0.05, 0)), size: radii.clone().multiplyScalar(0.62) });
  const n = count - 1;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    // y from -0.55 (lower rim) to 0.9 (crown top), evenly in area.
    const y = 0.9 - (1.45 * (i + 0.5)) / n;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const a = phase + i * golden;
    const dir = new THREE.Vector3(Math.cos(a) * ring, y, Math.sin(a) * ring);
    const k = reach[0] + (reach[1] - reach[0]) * rng();
    const c = centre.clone().add(dir.multiply(radii).multiplyScalar(k));
    const s = size[0] + (size[1] - size[0]) * rng();
    // Lower clusters are flatter (foliage hangs in layers under the crown).
    const flat = y < -0.2 ? 0.7 : 0.85;
    out.push({ centre: c, size: new THREE.Vector3(radii.x * s, radii.y * s * flat, radii.z * s) });
  }
  return out;
}

/** An oval cluster of generated leaf cards, heavily overlapped with the core. */
export function clusterGeometry(c: Cluster, rng: Rng): THREE.BufferGeometry {
  return crownCards({ centre: c.centre, radii: c.size }, rng() * Math.PI / 6);
}

/** Far crossed impostor: a rounded, ragged oval with the exact near crown envelope. */
export function farCrownGeometry(shape: CrownShape, rng: Rng): THREE.BufferGeometry[] {
  return [crownCards(shape, 0, rng.int(3, 10))];
}

/** Bounds from the actual cards, including asymmetry, hanging clusters and rim tufts. */
export function crownEnvelope(cards: readonly THREE.BufferGeometry[]): CrownShape {
  const bounds = new THREE.Box3();
  for (const g of cards) { g.computeBoundingBox(); bounds.union(g.boundingBox!); }
  return { centre: bounds.getCenter(new THREE.Vector3()), radii: bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5) };
}
