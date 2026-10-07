import * as THREE from 'three';
import { Mesher } from '@/props/core/mesher';
import { createRng } from '@/props/core/rng';
import { loftRings, tube } from '@/props/core/shapes';
import { PROPS_LOOK } from '@/props/look';
import { clusterGeometry, crownEnvelope, farCrownGeometry, planClusters } from '@/props/trees/gum-crown';
import { decorateGumGeometry } from '@/props/trees/gum-leaves';
import type { GumResult } from '@/props/trees/gum';

export interface UnderTreeDetail {
  kind: 'shrub' | 'fallenBark'; variant: number;
  x: number; z: number; yaw: number; scale: number;
}

/** Caller restricts this to Mountain woodland and samples terrain height for each placement. */
export function planUnderTreeDetails(seed: number, crownRadius: number): UnderTreeDetail[] {
  const rng = createRng(seed), radius = Math.max(1.5, crownRadius), out: UnderTreeDetail[] = [];
  const count = 6 + rng.int(0, 2);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, r = radius * rng.range(0.2, 0.75);
    out.push({ kind: i < 3 ? 'shrub' : 'fallenBark', variant: rng.int(0, 5), x: Math.cos(a) * r, z: Math.sin(a) * r, yaw: rng() * Math.PI * 2, scale: rng.range(0.45, 1.05) });
  }
  return out;
}

/** Dense low native bush with overlapping leaf clusters, using the gum atlas/material batch. */
export function buildGumShrub(variant: number): GumResult {
  const rng = createRng(3300 + variant * 73), near = new Mesher(), far = new Mesher();
  const H = rng.range(0.55, 1.25), radius = H * rng.range(0.65, 0.95);
  const shape = { centre: new THREE.Vector3(0, H * 0.6, 0), radii: new THREE.Vector3(radius, H * 0.4, radius * 0.85) };
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    near.add(tube([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * radius * 0.2, H * 0.35, Math.sin(a) * radius * 0.2)], [0.025, 0.012], 3), PROPS_LOOK.eucalyptus.boxBark);
  }
  const woodVertices = near.triangles * 3;
  const cards = planClusters(shape, 5, [0.42, 0.6], [0.45, 0.6], rng).map((c) => clusterGeometry(c, rng));
  const base = new THREE.Color(PROPS_LOOK.shrub.colours[((variant % PROPS_LOOK.shrub.colours.length) + PROPS_LOOK.shrub.colours.length) % PROPS_LOOK.shrub.colours.length]);
  for (const card of cards) near.add(card, base.clone().multiplyScalar(rng.range(0.8, 1)), { jitter: PROPS_LOOK.shrub.faceJitter });
  const farCards = farCrownGeometry(crownEnvelope(cards), rng);
  for (const card of farCards) far.add(card, base);
  const n = near.build(), f = far.build();
  decorateGumGeometry(n, woodVertices, cards, 'box', H);
  decorateGumGeometry(f, 0, farCards, 'box', H);
  for (const part of [...cards, ...farCards]) part.dispose();
  return { near: n, far: f, height: H, radius };
}

/** Thin curled ribbons of fallen gum bark. No boxes and no wind on litter. */
export function buildFallenBark(variant: number): THREE.BufferGeometry {
  const rng = createRng(7400 + variant * 149), mesher = new Mesher();
  const strips = 2 + variant % 3;
  for (let i = 0; i < strips; i++) {
    const length = rng.range(0.5, 1.1), width = rng.range(0.025, 0.07), yaw = rng() * Math.PI * 2;
    const ox = rng.jitter(0.28), oz = rng.jitter(0.28);
    const rings: THREE.Vector3[][] = [];
    for (let j = 0; j <= 5; j++) {
      const t = j / 5, w = width * (0.25 + Math.sin(t * Math.PI) * 0.75);
      const bend = Math.sin(t * Math.PI) * 0.09, curl = Math.sin(t * Math.PI * 2) * 0.014;
      rings.push([-1, 1].map((s) => {
        const x = (t - 0.5) * length, z = s * w + Math.sin(t * Math.PI) * 0.05;
        return new THREE.Vector3(ox + x * Math.cos(yaw) - z * Math.sin(yaw), 0.016 + bend + curl * s, oz + x * Math.sin(yaw) + z * Math.cos(yaw));
      }));
    }
    mesher.add(loftRings(rings, { closed: false }), new THREE.Color(PROPS_LOOK.eucalyptus.barkStrip).multiplyScalar(rng.range(0.9, 1.08)));
  }
  const geometry = mesher.build();
  decorateGumGeometry(geometry, geometry.getAttribute('position').count, [], 'smooth', 0.2);
  geometry.getAttribute('treeWind').array.fill(0);
  return geometry;
}
