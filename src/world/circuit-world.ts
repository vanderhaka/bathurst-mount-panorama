import type { CircuitId } from '@/track/circuits';
import type { SpeedProfile } from '@/track/speed-profile';
import type { Track } from '@/track/track-model';
import type { QualityPreset } from '@/render/renderer';
import { buildTerrain, type Terrain } from '@/world/terrain';
import { buildScenery, type Scenery } from '@/world/scenery';

export interface CircuitWorld {
  terrainLabel: string;
  sceneryLabel: string;
  terrain(track: Track, quality: QualityPreset): Promise<Terrain>;
  scenery(track: Track, terrain: Terrain, profile: SpeedProfile, quality: QualityPreset): Promise<Scenery>;
}

/** Per-circuit terrain and scenery builders with their loading-bar labels. */
export const CIRCUIT_WORLDS: Record<CircuitId, CircuitWorld> = {
  bathurst: {
    terrainLabel: 'Shaping the mountain',
    sceneryLabel: 'Planting gum trees and pitching tents',
    terrain: async (track, quality) => buildTerrain(track, undefined, quality),
    scenery: async (track, terrain, profile, quality) => buildScenery(track, terrain, profile, quality),
  },
  adelaide: {
    terrainLabel: 'Laying out Victoria Park',
    sceneryLabel: 'Building city streets and pit facilities',
    terrain: async (track, quality) => (await import('@/world/adelaide-terrain')).buildAdelaideTerrain(track, quality),
    scenery: async (track, terrain, profile, quality) => (await import('@/world/adelaide-scenery')).buildAdelaideScenery(track, terrain, profile, quality),
  },
  'gold-coast': {
    terrainLabel: 'Laying out the Surfers Paradise streets',
    sceneryLabel: 'Building the beachfront skyline',
    terrain: async (track, quality) => (await import('@/world/gold-coast-terrain')).buildGoldCoastTerrain(track, quality),
    scenery: async (track, terrain, profile, quality) => (await import('@/world/gold-coast-scenery')).buildGoldCoastScenery(track, terrain, profile, quality),
  },
};
