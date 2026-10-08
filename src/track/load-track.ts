import type { CircuitId } from '@/track/circuits';
import { Track } from '@/track/track-model';

const LOADERS: Record<CircuitId, () => Promise<Track>> = {
  bathurst: async () => new Track(),
  adelaide: async () => (await import('@/track/adelaide')).createAdelaideTrack(),
};

/** Builds the track model for a circuit; Adelaide stays in its own chunk. */
export function loadTrack(id: CircuitId): Promise<Track> {
  return LOADERS[id]();
}
