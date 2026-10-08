import { describe, expect, it } from 'vitest';
import { hudTrackInfo } from '@/game/hud-bridge';
import { turnForPlace } from '@/hud/map-geometry';
import { createAdelaideTrack } from '@/track/adelaide';
import { Track } from '@/track/track-model';
import type { HudTrackInfo } from '@/types/hud';

/** What the HUD receives from the game for a car at lap distance s: the place name and lap fraction. */
function labelAt(track: Track, info: HudTrackInfo, s: number): { place: string; turn: number } {
  const place = track.placeAt(s);
  return { place, turn: turnForPlace(info.corners, place, track.lapFraction(s)) };
}

/** The matching rule before corners were matched on their place: by corner name only. */
function legacyTurn(corners: HudTrackInfo['corners'], name: string, progress: number): number {
  let turn = corners.find(c => c.name === name)?.turn ?? 0;
  let at = -1;
  for (const c of corners) {
    if (c.name === name && c.progress <= progress + 0.002 && c.progress > at) { at = c.progress; turn = c.turn; }
  }
  return turn;
}

describe('Adelaide HUD turn labels', () => {
  const track = createAdelaideTrack(), info = hudTrackInfo(track);

  it('shows the matching turn number at every corner apex, T1 to T14', () => {
    expect(track.corners).toHaveLength(14);
    for (const corner of track.corners) expect(labelAt(track, info, corner.s).turn, `T${corner.turn}`).toBe(corner.turn);
  });

  it('keeps each turn on screen through its approach and exit until the next turn is reached', () => {
    for (const [i, corner] of track.corners.entries()) {
      const next = track.corners[i + 1];
      for (const s of [corner.s + 1, corner.s + 6]) {
        if (next && s >= next.s - 12) continue;
        if (track.placeAt(s) !== track.placeAt(corner.s)) continue;
        expect(labelAt(track, info, s).turn, `T${corner.turn} at ${s.toFixed(0)} m`).toBe(corner.turn);
      }
    }
  });

  it('shows no turn on the pit straight', () => {
    for (const s of [10, 120, 3100, 3200]) expect(labelAt(track, info, s)).toEqual({ place: 'Pit Straight', turn: 0 });
  });

  it('gives every named stretch holding a corner a name that is not reused elsewhere', () => {
    for (const corner of track.corners) {
      const place = track.placeAt(corner.s);
      expect(track.places.filter(p => p.name === place), place).toHaveLength(1);
    }
  });

  it('labels the Senna Chicane as T1 and T2, and the exit onto Wakefield Road as T3', () => {
    expect(labelAt(track, info, 285)).toEqual({ place: 'Senna Chicane', turn: 1 });
    expect(labelAt(track, info, 301)).toEqual({ place: 'Senna Chicane', turn: 2 });
    expect(labelAt(track, info, 427.6)).toEqual({ place: 'Wakefield Road', turn: 3 });
    expect(labelAt(track, info, 2977.7)).toEqual({ place: 'Final Hairpin', turn: 14 });
  });
});

describe('corner matching by place', () => {
  const corners: HudTrackInfo['corners'] = [
    { progress: 0.2, name: 'Wakefield Road to East Terrace', place: 'Wakefield Road', turn: 4 },
    { progress: 0.4, name: 'Final hairpin', place: 'Final Hairpin', turn: 14 },
    { progress: 0.6, name: 'Legacy corner', turn: 9 },
  ];

  it('matches on the place that holds the apex, not on a differently spelled corner name', () => {
    expect(turnForPlace(corners, 'Wakefield Road', 0.2)).toBe(4);
    expect(turnForPlace(corners, 'Final Hairpin', 0.4)).toBe(14);
  });

  it('falls back to the corner name when a harness supplies no place, and to no turn on a straight', () => {
    expect(turnForPlace(corners, 'Legacy corner', 0.6)).toBe(9);
    expect(turnForPlace(corners, 'Mountain Straight', 0.3)).toBe(0);
  });
});

describe('Bathurst HUD turn labels', () => {
  const track = new Track(), info = hudTrackInfo(track);

  it('shows the matching turn number at every one of the 23 corner apexes', () => {
    expect(track.corners).toHaveLength(23);
    for (const corner of track.corners) expect(labelAt(track, info, corner.s).turn, `T${corner.turn}`).toBe(corner.turn);
  });

  it('shows no turn on Pit Straight or the Mountain Straight', () => {
    expect(labelAt(track, info, 100)).toEqual({ place: 'Pit Straight', turn: 0 });
    expect(labelAt(track, info, 800)).toEqual({ place: 'Mountain Straight', turn: 0 });
  });

  it('labels every metre of the lap exactly as the name-based rule did before', () => {
    for (let s = 0; s < track.length; s += 2.5) {
      const place = track.placeAt(s), progress = track.lapFraction(s);
      expect(turnForPlace(info.corners, place, progress), `${place} at ${s} m`).toBe(legacyTurn(info.corners, place, progress));
    }
  });
});
