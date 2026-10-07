import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { buildHudState } from '@/game/hud-bridge';
import { RaceSession } from '@/game/race-session';
import { Vehicle } from '@/physics/vehicle';
import type { TyreCompound } from '@/physics/tyre-state';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { computeSpeedProfile } from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS } from '@/types/session';

const track = new Track(), line = computeRacingLine(track);
function session(compound: TyreCompound = 'soft'): RaceSession {
  const vehicle = new Vehicle(CAR_SPECS.camaro, track, placeKerbs(track, line));
  const entity = {
    vehicle, livery: { number: 6, primary: 0xff0000 },
    reset: (s: number, d: number) => vehicle.reset(s, d), repair: () => vehicle.repair(),
  } as unknown as CarEntity;
  return new RaceSession('camaro', track, line, entity, compound);
}

describe('real stint values in the game HUD', () => {
  it('reads the same tyre/fuel state used by the wheel forces and never advances it on a render update', () => {
    const race = session(), v = race.entity.vehicle;
    v.stint.reset({ fuelL: 20, compound: 'hard', tempC: 100, wear: 0.3 });
    const profile = computeSpeedProfile(track, line, v.spec);
    const state = buildHudState(race, profile, DEFAULT_SETTINGS, 60, null);
    expect(state.tyres).toBe(v.telemetry.tyres);
    expect(state.fuel).toBe(v.telemetry.fuel);
    expect(state.tyres?.[0].wear).toBe(0.3);
    expect(state.tyreCompound).toBe('hard');
    expect(state.fuel?.litres).toBe(20);
    buildHudState(race, profile, DEFAULT_SETTINGS, 60, state);
    expect(v.stint.fuel.litres).toBe(20);
    expect(v.stint.tyres[0].wear).toBe(0.3);
  });

  it('restarting fills the reference load and fits fresh cold tyres of the selected compound', () => {
    const race = session('hard');
    race.entity.vehicle.stint.reset({ fuelL: 12, compound: 'soft', tempC: 130, wear: 0.5 });
    race.placeOnGrid();
    expect(race.entity.vehicle.stint.fuel.litres).toBe(80);
    expect(race.entity.vehicle.stint.tyres[0].tempC).toBe(52);
    expect(race.entity.vehicle.stint.tyres[0].wear).toBe(0);
    expect(race.entity.vehicle.stint.tyreModel.compound).toBe('hard');
  });
});
