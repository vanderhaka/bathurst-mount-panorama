import * as THREE from 'three';

/** Horizon sampling approximates the blocked upper hemisphere, baked once. */
export function horizonVisibility(height: number, samples: number[], radius: number): number {
  if (radius <= 0 || samples.length === 0) return 1;
  const blocked = samples.reduce((sum, h) => sum + Math.max(0, Math.atan2(h - height, radius)) / (Math.PI / 2), 0) / samples.length;
  return Math.max(0.55, 1 - blocked * 0.75);
}

export function contactVisibility(distance: number, radius: number): number {
  if (radius <= 0 || distance >= radius) return 1;
  const u = Math.max(0, distance / radius);
  return 1 - 0.28 * (1 - u * u * (3 - 2 * u));
}

/** The grid's already sampled height field avoids extra DEM queries. */
export function bakeHeightFieldAo(geo: THREE.BufferGeometry, width: number, height: number, cell: number, strength: number): void {
  const pos = geo.getAttribute('position'), colour = geo.getAttribute('color');
  if (!colour) return;
  const offsets = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let z = 0; z <= height; z++) for (let x = 0; x <= width; x++) {
    const i = z * (width + 1) + x, h = pos.getY(i), horizons: number[] = [];
    for (const [dx, dz] of offsets) {
      const sx = Math.max(0, Math.min(width, x + dx * 2)), sz = Math.max(0, Math.min(height, z + dz * 2));
      horizons.push(pos.getY(sz * (width + 1) + sx));
    }
    const k = 1 - (1 - horizonVisibility(h, horizons, cell * 2)) * strength;
    colour.setXYZ(i, colour.getX(i) * k, colour.getY(i) * k, colour.getZ(i) * k);
  }
  colour.needsUpdate = true;
}

export interface ContactFootprint { x: number; z: number; radius: number }

/** Spatial bins keep baking linear in terrain vertices and placed objects. */
export class ContactAo {
  private readonly cells = new Map<string, ContactFootprint[]>();
  add(x: number, z: number, radius: number): void {
    const p = { x, z, radius: Math.max(4, Math.min(12, radius)) };
    const key = `${Math.floor(x / 24)}:${Math.floor(z / 24)}`;
    if (!this.cells.has(key)) this.cells.set(key, []);
    this.cells.get(key)!.push(p);
  }
  bake(root: THREE.Object3D, strength: number): void {
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const pos = object.geometry.getAttribute('position'), colour = object.geometry.getAttribute('color');
      if (!colour) return;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i), bx = Math.floor(x / 24), bz = Math.floor(z / 24);
        let k = 1;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          for (const p of this.cells.get(`${bx + dx}:${bz + dz}`) ?? []) k = Math.min(k, contactVisibility(Math.hypot(x - p.x, z - p.z), p.radius));
        }
        k = 1 - (1 - k) * strength;
        colour.setXYZ(i, colour.getX(i) * k, colour.getY(i) * k, colour.getZ(i) * k);
      }
      colour.needsUpdate = true;
    });
  }
}
