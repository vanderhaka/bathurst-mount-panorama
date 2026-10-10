import { describe, expect, it } from 'vitest';
import {
  currentSeason, decodeReplay, encodeReplay, isPlausibleReplay, isSeasonId, MAX_REPLAY_CHARS, normalizeShootoutNickname,
  REPLAY_FRAME_RATE, shootoutNicknameError,
} from '@/shootout/model';

/** A lap of `seconds` around a 2 km loop with hills, as ghost frames. */
function lap(seconds: number, speed = 52): Float32Array {
  const count = Math.round(seconds * REPLAY_FRAME_RATE) + 1, radius = 2000 / (2 * Math.PI);
  const frames = new Float32Array(count * 8);
  for (let i = 0; i < count; i++) {
    const angle = (i / REPLAY_FRAME_RATE) * speed / radius;
    frames.set([300 + radius * Math.cos(angle), 700 + 8 * Math.sin(angle * 2), -1200 + radius * Math.sin(angle),
      angle + Math.PI / 2, 0.02, -0.01, 0.1, speed], i * 8);
  }
  return frames;
}

describe('Shootout seasons', () => {
  it.each([
    ['2026-10-10T09:00:00Z', '2026-10-05', '2026-10-04T13:00:00.000Z', '2026-10-11T13:00:00.000Z'],
    // Daylight saving began on Sunday 4 October 2026, so that week is 167 hours long.
    ['2026-10-04T12:59:59Z', '2026-09-28', '2026-09-27T14:00:00.000Z', '2026-10-04T13:00:00.000Z'],
    ['2026-10-04T13:00:00Z', '2026-10-05', '2026-10-04T13:00:00.000Z', '2026-10-11T13:00:00.000Z'],
    // It ended on Sunday 5 April 2026: a 169-hour week.
    ['2026-04-05T13:59:59Z', '2026-03-30', '2026-03-29T13:00:00.000Z', '2026-04-05T14:00:00.000Z'],
    ['2026-04-05T14:00:00Z', '2026-04-06', '2026-04-05T14:00:00.000Z', '2026-04-12T14:00:00.000Z'],
    ['2026-12-31T20:00:00Z', '2026-12-28', '2026-12-27T13:00:00.000Z', '2027-01-03T13:00:00.000Z'],
  ])('places %s in the week of %s', (now, id, startsAt, endsAt) => {
    expect(currentSeason(new Date(now))).toEqual({ id, startsAt, endsAt });
    expect(isSeasonId(id)).toBe(true);
  });

  it('accepts only Monday dates as season ids', () => {
    expect(isSeasonId('2026-10-06')).toBe(false);
    expect(isSeasonId('2026-02-30')).toBe(false);
    expect(isSeasonId('20261005')).toBe(false);
  });
});

describe('Shootout nicknames', () => {
  it('normalises with NFKC and trims', () => {
    expect(normalizeShootoutNickname(' Ｊames　')).toBe('James');
    expect(normalizeShootoutNickname('José Ñandú')).toBe('José Ñandú');
    expect(normalizeShootoutNickname('é'.repeat(24))).toBe('é'.repeat(24));
    expect(normalizeShootoutNickname('🏎️ Racer')).toBe('🏎️ Racer');
  });

  it.each([
    ['', 'Enter a nickname.'], ['   ', 'Enter a nickname.'], ['x'.repeat(25), 'Use a nickname of 24 characters or fewer.'],
    ['Ja‮mes', 'hidden'], ['Ja​mes', 'hidden'], ['Ja⁦mes', 'hidden'], ['James', 'hidden'], ['Ja͸mes', 'hidden'],
    ['Ja\nmes', 'hidden'], ['Ja mes', 'hidden'], ['Ja\u{e0041}', 'hidden'], ['\ud800James', 'hidden'],
    ['F.U.C.K', 'different'], ['sh1t happens', 'different'], ['Big Dick', 'different'], ['W4NK3R', 'different'], ['$lut', 'different'], ['N1GG3R', 'different'],
  ])('rejects %j', (nickname, message) => {
    expect(shootoutNicknameError(nickname)).toContain(message);
    expect(normalizeShootoutNickname(nickname)).toBeNull();
  });

  it.each(['Dickson', 'Classic', 'Shi Tan', 'Assassin 77', 'Cockburn', 'Hancock'])('allows %j', (nickname) => {
    expect(normalizeShootoutNickname(nickname)).toBe(nickname);
  });
});

describe('Shootout replays', () => {
  it('encodes a two-minute lap well under 48 KB and decodes it back to ghost frames', () => {
    const frames = lap(120);
    const encoded = encodeReplay(frames);
    expect(encoded.length).toBeLessThan(MAX_REPLAY_CHARS / 3);
    const decoded = decodeReplay(encoded);
    if (!decoded) throw new Error('Expected a replay');
    expect(decoded.length).toBe(frames.length);
    for (let o = 0; o < frames.length; o += 8) {
      for (const k of [0, 1, 2]) expect(Math.abs(decoded[o + k] - frames[o + k])).toBeLessThan(0.06);
      const heading = decoded[o + 3] - frames[o + 3];
      expect(Math.abs(Math.atan2(Math.sin(heading), Math.cos(heading)))).toBeLessThan(0.002);
      expect([decoded[o + 4], decoded[o + 5], decoded[o + 6]]).toEqual([0, 0, 0]);
      expect(Math.abs(decoded[o + 7] - 52)).toBeLessThan(1);
    }
    expect(isPlausibleReplay(encoded, 120)).toBe(true);
    expect(isPlausibleReplay(encoded, 121.5)).toBe(false);
  });

  it('keeps the exact frame count when it is not a multiple of the replay step', () => {
    const frames = lap(115.4);
    const decoded = decodeReplay(encodeReplay(frames));
    expect(decoded?.length).toBe(frames.length);
    expect(decoded?.[frames.length - 8]).toBeCloseTo(frames[frames.length - 8], 1);
  });

  it('refuses a replay that jumps faster than 100 m/s, and malformed input', () => {
    const frames = lap(120);
    frames[600 * 8] += 30;
    const encoded = encodeReplay(frames);
    expect(decodeReplay(encoded)).not.toBeNull();
    expect(isPlausibleReplay(encoded, 120)).toBe(false);
    expect(isPlausibleReplay(encodeReplay(lap(120, 101)), 120)).toBe(false);
    for (const bad of ['', 'not base64!', 'AQ==', encodeReplay(lap(2)).slice(0, -4), btoa('\u0002\u0001\u0000\u0000\u0000\u0000'), 'A'.repeat(MAX_REPLAY_CHARS + 4)]) {
      expect(decodeReplay(bad)).toBeNull();
    }
    expect(isPlausibleReplay(null, 120)).toBe(false);
  });
});
