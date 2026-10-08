import data from '@/track/data/adelaide.json';
import { sampleCircuit } from '@/track/sample-circuit';
import { Track, type Corner, type TrackSource } from '@/track/track-model';

/** Current 2026 Supercars route. OSM geometry; flat elevation and timing loops are estimates. */
export function createAdelaideTrack(): Track {
  const corners: Corner[] = data.corners.map(c => ({ ...c, dir: c.dir === 'L' ? 'L' : 'R' }));
  const source: TrackSource = {
    meta: { id: 'adelaide', lengthM: 3219, elevationBaseM: 0, elevationMinM: 0, elevationMaxM: 0, finishLineS: 0, startLineS: 100 },
    points: sampleCircuit(data.points, 3219), sections: [], corners, sectorStarts: [1280, 2310],
    places: [{ s: 0, name: 'Pit Straight' }, { s: 220, name: 'Senna Chicane' }, { s: 440, name: 'Wakefield Road' },
      { s: 740, name: 'East Terrace' }, { s: 900, name: 'Flinders Street' }, { s: 1050, name: 'Hutt Street' },
      { s: 1200, name: 'Bartels Road' }, { s: 1860, name: 'Dequetteville Terrace' }, { s: 2260, name: 'Wakefield Road' },
      { s: 2395, name: 'Victoria Park' }, { s: 2935, name: 'Final Hairpin' }, { s: 3040, name: 'Pit Straight' }],
    kerbCorners: corners.map(c => ({ turn: c.turn, width: 1.05, halfLength: c.turn < 3 ? 10 : 18, type: 'flat',
      reference: `Adelaide 2026 numbered circuit map T${c.turn}; profile estimated`, heightEstimate: true })),
  };
  return new Track(source);
}
