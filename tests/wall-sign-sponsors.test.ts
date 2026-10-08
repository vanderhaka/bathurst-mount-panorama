import { describe, expect, it } from 'vitest';
import { ADELAIDE_SPONSORS, SPONSORS } from '@/art/sponsors';
import { createAdelaideTrack } from '@/track/adelaide';
import { CORNERS, NAMED_PLACES } from '@/track/layout';
import { Track } from '@/track/track-model';
import { sponsorAt, sponsorCell } from '@/world/scenery/billboards';
import { wallSignRuns, type SignRun } from '@/world/wall-signs';

/** Names that belong to Mount Panorama: its corners, straights, region and every Bathurst brand. */
const BATHURST_NAMES = [
  ...CORNERS.map(c => c.name), ...NAMED_PLACES.map(p => p.name), ...SPONSORS.map(sp => sp.name),
  'Bathurst', 'Mount Panorama', 'Mountain', 'Panorama', 'Central West', 'Gold Country', 'Skyline', 'Hell Corner',
].map(name => name.toUpperCase());

/** Sponsor index per run, left side then right side (one digit each; every list holds eight brands). */
function rows(runs: SignRun[]): string[] {
  return [1, -1].map(sign => runs.filter(r => r.sign === sign).map(r => r.sponsor).join(''));
}

describe('Adelaide wall signs', () => {
  const track = createAdelaideTrack(), runs = wallSignRuns(track);

  it('carry Adelaide sponsors only, never a Bathurst corner, region or brand name', () => {
    expect(runs.length).toBeGreaterThan(80);
    for (const run of runs) {
      const name = ADELAIDE_SPONSORS[run.sponsor].name;
      for (const bathurst of BATHURST_NAMES) expect(name, `run at ${run.start.toFixed(0)} m`).not.toContain(bathurst);
    }
  });

  it('use fictional generated brands that are none of the Bathurst brands', () => {
    expect(ADELAIDE_SPONSORS).toHaveLength(SPONSORS.length);
    const bathurst = new Set(SPONSORS.map(sp => sp.name));
    const names = ADELAIDE_SPONSORS.map(sp => sp.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(bathurst.has(name)).toBe(false);
  });

  it('rotate through every brand so no sign style dominates', () => {
    const counts = new Array<number>(ADELAIDE_SPONSORS.length).fill(0);
    for (const run of runs) counts[run.sponsor]++;
    const even = runs.length / ADELAIDE_SPONSORS.length;
    for (const n of counts) {
      expect(n).toBeGreaterThan(even / 2);
      expect(n).toBeLessThan(even * 2);
    }
  });

  it('choose the same brand whatever the distance, as no Adelaide brand is tied to a corner', () => {
    for (const pick of [0, 1, 5, 8]) {
      const first = sponsorAt(0, pick, 'adelaide');
      for (const s of [150, 1000, 3100]) expect(sponsorAt(s, pick, 'adelaide')).toBe(first);
    }
    expect(sponsorCell(3, 'adelaide')).toEqual(sponsorCell(3, 'bathurst'));
  });
});

describe('Bathurst wall signs', () => {
  it('keep exactly the placement they had, corner-named brands near their corner', () => {
    const runs = wallSignRuns(new Track());
    expect(rows(runs)).toEqual([
      '054777777771054105410541054105410541054105222226262666613333333333333333333305410541054',
      '10777777775410541054105410541054105410541022226262666654333333333333333333341054105410',
    ]);
    const namesIn = (from: number, to: number) => new Set(runs.filter(r => r.start >= from && r.start <= to).map(r => SPONSORS[r.sponsor].name));
    expect(namesIn(180, 720).has('HELL CORNER')).toBe(true);
    expect(namesIn(3024, 3204).has('SKYLINE')).toBe(true);
  });
});
