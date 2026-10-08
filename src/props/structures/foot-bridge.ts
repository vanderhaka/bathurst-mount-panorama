import * as THREE from 'three';
import { BUILDING, TRACKSIDE } from '@/art/palette';
import { StructureParts, stairFlight, V } from '@/props/structures/parts';

// Pedestrian / advertising bridge spanning the track along X: a deck carried by
// two steel Warren trusses clad in blank banner panels, a light roof, end towers
// and a straight stair down each end (running away from the track along ±X).

const WIDTH = 3.0;
const TRUSS_H = 2.4;

/** `stairs`: 'outward' (default) runs each flight away along X; 'along' turns it parallel to the track beside an inboard tower. */
export function buildFootBridge(opts: { span: number; clearance: number; stairs?: 'outward' | 'along' }): THREE.Group {
  const along = opts.stairs === 'along';
  const S = Math.max(6, opts.span);
  const C = Math.max(3, opts.clearance);
  const p = new StructureParts();
  const half = S / 2 + 1.5;
  const steel = BUILDING.darkGrey;
  // Deck slab and walkway.
  p.block(2 * half, 0.45, WIDTH + 0.4, 0, C - 0.45, 0, BUILDING.grey);
  p.block(2 * half, 0.04, WIDTH - 0.2, 0, C, 0, TRACKSIDE.concreteDark);
  // Warren trusses on both edges.
  const bays = Math.max(4, Math.round((2 * half) / 2.6));
  for (const z of [-WIDTH / 2 - 0.1, WIDTH / 2 + 0.1]) {
    p.beam(V(-half, C, z), V(half, C, z), 0.09, steel);
    p.beam(V(-half, C + TRUSS_H, z), V(half, C + TRUSS_H, z), 0.09, steel);
    for (let i = 0; i <= bays; i++) {
      const x = -half + (2 * half * i) / bays;
      p.beam(V(x, C, z), V(x, C + TRUSS_H, z), 0.05, steel);
      if (i < bays) {
        const xn = -half + (2 * half * (i + 1)) / bays;
        p.beam(i % 2 ? V(x, C, z) : V(x, C + TRUSS_H, z), i % 2 ? V(xn, C + TRUSS_H, z) : V(xn, C, z), 0.045, steel);
      }
    }
  }
  // Banner cladding over the span on both faces (blank: white with coloured bands).
  const accents = [BUILDING.accentRed, BUILDING.accentBlue];
  for (const s of [-1, 1]) {
    const z = s * (WIDTH / 2 + 0.25);
    for (let k = 0; k < 2; k++) {
      const x = -S / 4 + k * (S / 2);
      p.block(S / 2 - 0.3, TRUSS_H - 0.3, 0.08, x, C + 0.15, z, BUILDING.white);
      p.block(S / 2 - 0.3, 0.45, 0.1, x, C + 0.25, z, accents[(k + (s > 0 ? 0 : 1)) % 2]);
      p.block(S / 2 - 0.3, 0.12, 0.1, x, C + TRUSS_H - 0.4, z, accents[(k + 1) % 2]);
    }
  }
  // Light roof.
  p.block(2 * half + 0.6, 0.15, WIDTH + 1.2, 0, C + TRUSS_H + 0.05, 0, BUILDING.roof);
  // End towers on four columns, landings, stairs running away from the track.
  const flights: THREE.Group[] = [];
  for (const s of [-1, 1] as const) {
    const x = s * (along ? half - 1.1 : half);
    for (const dx of [-0.9, 0.9]) for (const dz of [-WIDTH / 2, WIDTH / 2]) p.beam(V(x + dx, 0, dz), V(x + dx, C - 0.45, dz), 0.14, BUILDING.grey, 6);
    p.block(2.4, 0.4, WIDTH + 0.4, along ? s * (half - 1.2) : x + s * 1.2, C - 0.4, 0, BUILDING.grey);
    if (along) {
      // Flight built running along +X, then turned onto Z so it leaves the landing's side face.
      const q = new StructureParts(); stairFlight(q, 0, 1, C, 0, 1.6);
      const flight = q.toGroup('foot-bridge-stair'); flight.rotation.y = s * Math.PI / 2; flight.position.set(x, 0, -s * (WIDTH / 2 + 0.2));
      flights.push(flight);
    } else stairFlight(p, x + s * 2.4, s, C, 0, 1.6);
    p.block(1.8, 0.3, 1.8, x, 0, 0, TRACKSIDE.concrete);
  }
  const bridge = p.toGroup('foot-bridge');
  for (const flight of flights) bridge.add(flight);
  return bridge;
}
