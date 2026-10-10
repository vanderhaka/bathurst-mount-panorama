import * as THREE from 'three';
import { getPropAsset } from '@/props';
import type { Terrain } from '@/world/terrain';
import type { PropInstancer } from '@/world/scenery/instancer';

const up = new THREE.Vector3();

/**
 * Adds a boulder bedded into the slope: sunk 20-35 % of its height and tilted most of
 * the way to the local surface normal. The sink fraction comes from the yaw (no extra rng draws).
 */
export function addEmbeddedRock(inst: PropInstancer, terrain: Terrain, variant: number, x: number, z: number, yaw: number, scale: number): void {
  const ground = terrain.heightAt(x, z);
  const e = 1.5;
  up.set(terrain.heightAt(x - e, z) - terrain.heightAt(x + e, z), 2 * e, terrain.heightAt(x, z - e) - terrain.heightAt(x, z + e)).normalize();
  up.lerp(new THREE.Vector3(0, 1, 0), 0.2).normalize();
  const sink = 0.2 + 0.15 * ((yaw * 7.31) % 1);
  const height = getPropAsset('rock', variant).height * scale;
  inst.add('rock', variant, x, ground - sink * height, z, yaw, scale, undefined, up);
}
