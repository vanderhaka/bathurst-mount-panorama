import { describe, expect, it } from 'vitest';
import { CAR_SPECS, circuitCarSpec, type CarKind } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { ProfileCache } from '@/game/profile-cache';
import { peakPowerKw } from '@/hud/indicators';
import { createAdelaideTrack } from '@/track/adelaide';
import { CIRCUITS } from '@/track/circuits';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile, LINE_PROFILE } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { carSheet } from '@/ui/car-data';
import type { World } from '@/world/world';

const CARS: CarKind[] = ['camaro', 'mustang', 'supra'];
const peakNm = (kind: CarKind, circuit: 'bathurst' | 'adelaide') => Math.max(...circuitCarSpec(kind, circuit).engine.torqueCurve.map(([, nm]) => nm));

describe('the altitude derate belongs to the circuit', () => {
  it('derates Bathurst (700-870 m) to 92 % and leaves sea-level Adelaide at the rated curve', () => {
    expect(CIRCUITS.bathurst.altitudeDerate).toBe(0.92);
    expect(CIRCUITS.adelaide.altitudeDerate).toBe(1);
    expect(CIRCUITS['gold-coast'].altitudeDerate).toBe(1);
    for (const kind of CARS) {
      expect(peakNm(kind, 'adelaide')).toBe(660);
      expect(peakNm(kind, 'bathurst')).toBe(Math.round(660 * 0.92));
    }
  });

  it('keeps the Bathurst car bit-identical: the same CAR_SPECS object', () => {
    for (const kind of CARS) expect(circuitCarSpec(kind, 'bathurst')).toBe(CAR_SPECS[kind]);
  });

  it('changes only the torque curve at Adelaide, and returns one stable object per car', () => {
    for (const kind of CARS) {
      const adelaide = circuitCarSpec(kind, 'adelaide');
      expect(circuitCarSpec(kind, 'adelaide')).toBe(adelaide);
      expect({ ...adelaide, engine: { ...adelaide.engine, torqueCurve: [] } }).toEqual({ ...CAR_SPECS[kind], engine: { ...CAR_SPECS[kind].engine, torqueCurve: [] } });
      const ratio = peakPowerKw(adelaide.engine.torqueCurve).kw / peakPowerKw(CAR_SPECS[kind].engine.torqueCurve).kw;
      expect(ratio).toBeCloseTo(1 / 0.92, 2);
    }
  });

  it('gives the Adelaide racing line and AI the full-power car', () => {
    const track = createAdelaideTrack(), line = computeRacingLine(track);
    const derated = computeSpeedProfile(track, line, tunedSpec(CAR_SPECS.camaro, DEFAULT_HANDLING), LINE_PROFILE);
    const profile = computeSpeedProfile(track, line, tunedSpec(circuitCarSpec('camaro', 'adelaide'), DEFAULT_HANDLING), LINE_PROFILE);
    const cache = new ProfileCache(() => ({ track, line, profile }) as World);
    expect(cache.get('mustang').player.lapTimeS).toBeLessThan(
      computeSpeedProfile(track, line, tunedSpec(CAR_SPECS.mustang, DEFAULT_HANDLING), LINE_PROFILE).lapTimeS - 0.3);
    expect(profile.lapTimeS).toBeLessThan(derated.lapTimeS - 0.3);
    const bathurst = new Track(), bathurstLine = computeRacingLine(bathurst);
    const bathurstCache = new ProfileCache(() => ({ track: bathurst, line: bathurstLine, profile: derated }) as World);
    expect(bathurstCache.get('mustang').player.lapTimeS).toBe(
      computeSpeedProfile(bathurst, bathurstLine, tunedSpec(CAR_SPECS.mustang, DEFAULT_HANDLING), LINE_PROFILE).lapTimeS);
  });

  it('tells the truth about power on the car-select screen for the selected circuit', () => {
    for (const kind of CARS) {
      expect(carSheet(kind, 'bathurst').note).toMatch(/Altitude-derated in game at Bathurst \(~4\d\d kW\)/);
      expect(carSheet(kind, 'adelaide').note).not.toMatch(/derated/i);
      expect(carSheet(kind, 'adelaide').note).toMatch(/Adelaide/);
    }
  });
});
