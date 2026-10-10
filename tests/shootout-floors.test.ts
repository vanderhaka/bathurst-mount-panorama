import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { GHOST_RATE } from '@/race/ghost';
import {
  BLOCKED_NICKNAME_PARTS, BLOCKED_NICKNAME_WORDS, isPlausibleShootoutLap, MIN_SHOOTOUT_LAP_S, MIN_SHOOTOUT_SECTORS_S, REPLAY_FRAME_RATE, SHOOTOUT_CARS,
} from '@/shootout/model';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';

const track = new Track();
const line = computeRacingLine(track);
// Sector boundaries as the lap timer measures them (src/game/race-session.ts): lap distance from the timing line.
const sectorStarts = track.sectorStarts.map((s) => track.wrapS(s - track.startLineS));

function ideal(car: typeof SHOOTOUT_CARS[number]) {
  const profile = computeSpeedProfile(track, line, tunedSpec(CAR_SPECS[car], DEFAULT_HANDLING), { gripFactor: 1 });
  const sectors = [0, 0, 0];
  for (let i = 0; i < track.n; i++) {
    const distance = track.wrapS((i + 0.5) * track.spacing - track.startLineS);
    const sector = sectorStarts.filter((start) => distance >= start).length;
    sectors[sector] += line.ds[i] / Math.max(1, (profile.speed[i] + profile.speed[(i + 1) % track.n]) / 2);
  }
  return { lapS: profile.lapTimeS, sectors };
}

describe('Shootout competition floors', () => {
  const ideals = SHOOTOUT_CARS.map(ideal);

  it('sit at about 97 % of the fastest ideal lap and sectors, rounded down', () => {
    for (const { lapS, sectors } of ideals) expect(sectors.reduce((a, b) => a + b, 0)).toBeCloseTo(lapS, 0);
    expect(MIN_SHOOTOUT_LAP_S).toBe(Math.floor(0.97 * Math.min(...ideals.map((i) => i.lapS))));
    expect(MIN_SHOOTOUT_SECTORS_S).toEqual([0, 1, 2].map((k) => Math.floor(0.97 * Math.min(...ideals.map((i) => i.sectors[k])))));
  });

  it('accept every car\'s ideal lap and refuse a lap or sector under the floor', () => {
    for (const { lapS, sectors } of ideals) expect(isPlausibleShootoutLap(lapS, sectors)).toBe(true);
    expect(isPlausibleShootoutLap(MIN_SHOOTOUT_LAP_S - 0.01, [46, 29, 36.99])).toBe(false);
    expect(isPlausibleShootoutLap(124, [45.9, 40, 38.1])).toBe(false);
    expect(isPlausibleShootoutLap(124, [50, 28.9, 45.1])).toBe(false);
    expect(isPlausibleShootoutLap(124, [50, 38.1, 35.9])).toBe(false);
    expect(isPlausibleShootoutLap(124, [50, 38, 36])).toBe(true);
  });

  it('match the database and replay rates', () => {
    const sql = readFileSync('supabase/migrations/20261010100000_shootout_seasons.sql', 'utf8');
    expect(sql).toContain(`p_time_s between ${MIN_SHOOTOUT_LAP_S} and 600`);
    MIN_SHOOTOUT_SECTORS_S.forEach((floor, i) => expect(sql).toContain(`p_sectors_s[${i + 1}] >= ${floor}`));
    for (const word of BLOCKED_NICKNAME_WORDS) expect(sql).toContain(`'${word}'`);
    expect(sql).toContain(`'(${BLOCKED_NICKNAME_PARTS.join('|')})'`);
    expect(REPLAY_FRAME_RATE).toBe(GHOST_RATE);
  });
});
