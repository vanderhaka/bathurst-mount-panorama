import { describe, expect, it } from 'vitest';
import { gridSlots } from '@/race/field/grid';
import { createAdelaideTrack } from '@/track/adelaide';
import { createGoldCoastTrack } from '@/track/gold-coast';
import { Track } from '@/track/track-model';

const tracks: Array<[string, Track]> = [['bathurst', new Track()], ['adelaide', createAdelaideTrack()], ['gold-coast', createGoldCoastTrack()]];

describe.each(tracks)('race grid on %s', (_name, track) => {
  const slots = gridSlots(track, 24);
  const behind = (s: number) => track.wrapS(track.gridLineS - s);

  it('returns one slot per car with pole nearest the line', () => {
    expect(slots).toHaveLength(24);
    expect(behind(slots[0].s)).toBeGreaterThan(0);
    expect(behind(slots[0].s)).toBeLessThan(10);
    expect(gridSlots(track, 0)).toEqual([]);
  });

  it('puts every slot strictly behind the previous one', () => {
    for (let k = 1; k < slots.length; k++) expect(behind(slots[k].s)).toBeGreaterThan(behind(slots[k - 1].s));
  });

  it('starts on the right and alternates columns', () => {
    expect(slots[0].d).toBeLessThan(0);
    expect(slots[1].d).toBeGreaterThan(0);
    expect(slots[2].d).toBeLessThan(0);
  });

  it('keeps every slot on the road surface', () => {
    for (const { s, d } of slots) {
      const i = track.wrap(Math.round(s / track.spacing));
      expect(d).toBeGreaterThanOrEqual(-track.right.edge[i] + 1);
      expect(d).toBeLessThanOrEqual(track.left.edge[i] - 1);
    }
  });

  it('keeps any two slots at least 6 m apart', () => {
    // Measured in (s, d): the slots are only a few samples apart, so snapping to a sample would blur it.
    for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) {
      expect(Math.hypot(slots[a].s - slots[b].s, slots[a].d - slots[b].d)).toBeGreaterThanOrEqual(6);
    }
  });
});
