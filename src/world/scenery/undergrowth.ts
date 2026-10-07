import { planUnderTreeDetails } from '@/props/trees/gum-undergrowth';
import { rng, type SpatialMask } from '@/world/scenery/geo';
import type { PropInstancer } from '@/world/scenery/instancer';
import type { Terrain } from '@/world/terrain';

interface TreePlacement { x: number; z: number; radius: number; yaw: number; scale: number; seed: number }
interface UndergrowthOptions { enabled: boolean; density: number; capacity: number }

/** Sparse native detail only under selected upland gums, never in paddocks or the track corridor. */
export function placeUnderTreeDetails(terrain: Terrain, inst: PropInstancer, mask: SpatialMask, tree: TreePlacement, options: UndergrowthOptions): number {
  if (!options.enabled || options.capacity <= 0 || terrain.heightAt(tree.x, tree.z) < 55 || rng(tree.seed)() >= options.density) return 0;
  const c = Math.cos(tree.yaw), s = Math.sin(tree.yaw);
  let count = 0;
  for (const p of planUnderTreeDetails(tree.seed, tree.radius)) {
    if (count >= options.capacity) break;
    const x = tree.x + (p.x * c + p.z * s) * tree.scale, z = tree.z + (-p.x * s + p.z * c) * tree.scale;
    if (terrain.clearance(x, z) < 4 || mask.blocked(x, z, 1)) continue;
    const y = terrain.heightAt(x, z) + 0.015;
    inst.add(p.kind === 'shrub' ? 'gumShrub' : 'fallenBark', p.variant, x, y, z, tree.yaw + p.yaw, p.scale * tree.scale);
    count++;
  }
  return count;
}
