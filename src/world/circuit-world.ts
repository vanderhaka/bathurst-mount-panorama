import type { CircuitId } from '@/track/circuits';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import type { QualityPreset } from '@/render/renderer';
import { runSync, type Steps } from '@/world/cooperative';
import { buildTerrainSteps, type Terrain } from '@/world/terrain';
import { buildScenerySteps, type Scenery } from '@/world/scenery';

export interface CircuitWorld {
  terrainLabel: string;
  sceneryLabel: string;
  /** The terrain build as cooperative steps (the circuit's module loads on demand): see world/cooperative.ts. */
  terrainSteps(track: Track, quality: QualityPreset): Promise<Steps<Terrain>>;
  scenerySteps(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Promise<Steps<Scenery>>;
  /** The same builds run straight through. */
  terrain(track: Track, quality: QualityPreset): Promise<Terrain>;
  scenery(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Promise<Scenery>;
}

type Parts = Pick<CircuitWorld, 'terrainLabel' | 'sceneryLabel' | 'terrainSteps' | 'scenerySteps'>;

const circuitWorld = (parts: Parts): CircuitWorld => ({
  ...parts,
  terrain: async (track, quality) => runSync(await parts.terrainSteps(track, quality)),
  scenery: async (track, terrain, profile, quality) => runSync(await parts.scenerySteps(track, terrain, profile, quality)),
});

/** Per-circuit terrain and scenery builders with their loading-bar labels. */
export const CIRCUIT_WORLDS: Record<CircuitId, CircuitWorld> = {
  bathurst: circuitWorld({
    terrainLabel: 'Shaping the mountain',
    sceneryLabel: 'Planting gum trees and pitching tents',
    terrainSteps: async (track, quality) => buildTerrainSteps(track, undefined, quality),
    scenerySteps: async (track, terrain, profile, quality) => buildScenerySteps(track, terrain, profile, quality),
  }),
  adelaide: circuitWorld({
    terrainLabel: 'Laying out Victoria Park',
    sceneryLabel: 'Building city streets and pit facilities',
    terrainSteps: async (track, quality) => (await import('@/world/adelaide-terrain')).buildAdelaideTerrainSteps(track, quality),
    scenerySteps: async (track, terrain, profile, quality) => (await import('@/world/adelaide-scenery')).buildAdelaideScenerySteps(track, terrain, profile, quality),
  }),
  'gold-coast': circuitWorld({
    terrainLabel: 'Laying out the Surfers Paradise streets',
    sceneryLabel: 'Building the beachfront skyline',
    terrainSteps: async (track, quality) => (await import('@/world/gold-coast-terrain')).buildGoldCoastTerrainSteps(track, quality),
    scenerySteps: async (track, terrain, profile, quality) => (await import('@/world/gold-coast-scenery')).buildGoldCoastScenerySteps(track, terrain, profile, quality),
  }),
};
