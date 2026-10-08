import type { CircuitId } from '@/track/circuits';
import { Track } from '@/track/track-model';

const LOADERS: Record<CircuitId, () => Promise<Track>> = {
  bathurst: async () => new Track(),
  adelaide: async () => (await import('@/track/adelaide')).createAdelaideTrack(),
  'gold-coast': async () => (await import('@/track/gold-coast')).createGoldCoastTrack(),
};

/** Builds the track model for a circuit; Adelaide and the Gold Coast stay in their own chunks. */
export function loadTrack(id: CircuitId): Promise<Track> {
  return LOADERS[id]();
}
