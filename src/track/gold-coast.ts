import data from '@/track/data/gold-coast.json';
import { goldCoastSides } from '@/track/gold-coast-layout';
import { sampleCircuit } from '@/track/sample-circuit';
import { Track, type Corner, type TrackSource } from '@/track/track-model';

/** Surfers Paradise Street Circuit. OSM geometry; flat elevation, widths and timing loops are estimates. */
export function createGoldCoastTrack(): Track {
  const corners: Corner[] = data.corners.map(c => ({ ...c, dir: c.dir === 'L' ? 'L' : 'R' }));
  const source: TrackSource = {
    // The circuit model is flat (py = 0). The base is only the altitude the HUD adds: SRTM 30 m at the
    // start line (docs/research/gold-coast.md). It does not touch physics, terrain or the road.
    meta: { id: 'gold-coast', lengthM: 2960, elevationBaseM: 7, elevationMinM: 7, elevationMaxM: 7, finishLineS: 0, startLineS: 100 },
    buildSides: goldCoastSides,
    points: sampleCircuit(data.points, 2960), sections: [], corners, sectorStarts: [900, 1960],
    // Each stretch starts just after the junction it is named for, so a turn belongs to the street it leaves:
    // T1-T3 Front Chicane, T4 Surfers Paradise Boulevard, T5 Main Beach Parade ... T15 Tedder Avenue.
    places: [{ s: 0, name: 'Pit Straight' }, { s: 440, name: 'Front Chicane' }, { s: 640, name: 'Surfers Paradise Boulevard' },
      { s: 790, name: 'Main Beach Parade' }, { s: 1350, name: 'Beach Chicane' }, { s: 1590, name: 'Main Beach Parade North' },
      { s: 1940, name: 'Breaker Street' }, { s: 2140, name: 'Serisier Avenue' }, { s: 2215, name: 'Hill Parade' },
      { s: 2465, name: 'Tedder Avenue' }, { s: 2560, name: 'Pit Straight' }],
    kerbCorners: corners.map(c => ({ turn: c.turn, width: 1.05, halfLength: c.turn <= 3 || (c.turn >= 6 && c.turn <= 10) ? 8 : 16, type: 'flat',
      reference: `Gold Coast 2025 numbered circuit map T${c.turn}; profile estimated`, heightEstimate: true })),
  };
  return new Track(source);
}
