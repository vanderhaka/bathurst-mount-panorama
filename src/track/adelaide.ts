import data from '@/track/data/adelaide.json';
import { adelaideSides } from '@/track/adelaide-layout';
import { sampleCircuit } from '@/track/sample-circuit';
import { Track, type Corner, type TrackSource } from '@/track/track-model';

/** Current 2026 Supercars route. OSM geometry; flat elevation and timing loops are estimates. */
export function createAdelaideTrack(): Track {
  const corners: Corner[] = data.corners.map(c => ({ ...c, dir: c.dir === 'L' ? 'L' : 'R' }));
  const source: TrackSource = {
    // The circuit model is flat (py = 0). The base is only the altitude the HUD adds: SRTM 30 m at the
    // start line (docs/research/adelaide.md). It does not touch physics, terrain or the road.
    meta: { id: 'adelaide', lengthM: 3219, elevationBaseM: 52, elevationMinM: 52, elevationMaxM: 52, finishLineS: 0, startLineS: 100 },
    buildSides: adelaideSides,
    points: sampleCircuit(data.points, 3219), sections: [], corners, sectorStarts: [1280, 2310],
    // Each stretch starts just after the junction it is named for, so a turn belongs to the street it leaves:
    // T1-T2 Senna Chicane, T3-T4 Wakefield Road, T5 East Terrace ... T14 Final Hairpin. A name that holds a
    // turn appears once, so the HUD cannot confuse the two Wakefield Road stretches.
    places: [{ s: 0, name: 'Pit Straight' }, { s: 220, name: 'Senna Chicane' }, { s: 360, name: 'Wakefield Road' },
      { s: 740, name: 'East Terrace' }, { s: 900, name: 'Flinders Street' }, { s: 1050, name: 'Hutt Street' },
      { s: 1200, name: 'Bartels Road' }, { s: 1860, name: 'Dequetteville Terrace' }, { s: 2260, name: 'Wakefield Road East' },
      { s: 2395, name: 'Victoria Park' }, { s: 2935, name: 'Final Hairpin' }, { s: 3040, name: 'Pit Straight' }],
    kerbCorners: corners.map(c => ({ turn: c.turn, width: 1.05, halfLength: c.turn < 3 ? 10 : 18, type: 'flat',
      reference: `Adelaide 2026 numbered circuit map T${c.turn}; profile estimated`, heightEstimate: true })),
  };
  return new Track(source);
}
