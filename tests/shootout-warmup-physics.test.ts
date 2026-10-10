import { describe, expect, it } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import type { CarEntity } from '@/game/car-entity';
import { RaceSession, WARMUP_SPEED, WARMUP_START_S } from '@/game/race-session';
import { competitionSettings } from '@/game/shootout-rules';
import { Vehicle } from '@/physics/vehicle';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import { Track } from '@/track/track-model';
import { DEFAULT_SETTINGS } from '@/types/session';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);

describe('rolling warm-up on the real car physics', () => {
  it.each(['camaro', 'mustang', 'supra'] as const)('the %s rolls on at speed, on the road, with tyres in their working window', (car) => {
    const vehicle = new Vehicle(CAR_SPECS[car], track, kerbs);
    const entity = { vehicle, reset: (s: number, d: number) => vehicle.reset(s, d), repair: () => vehicle.repair() } as unknown as CarEntity;
    const session = new RaceSession(car, track, line, entity, 'soft', competitionSettings(DEFAULT_SETTINGS), 'shootoutArcade');
    session.placeOnGrid();
    expect(vehicle.speed).toBeCloseTo(WARMUP_SPEED, 3);
    expect(vehicle.tp.s).toBeCloseTo(WARMUP_START_S, -1);
    for (const tyre of vehicle.stint.tyres) expect(tyre.grip).toBeCloseTo(1, 2);
    // A second of light throttle and no steering: the car keeps rolling straight on, nothing locks or spins.
    const input: VehicleInput = { throttle: 0.2, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
    for (let i = 0; i < 60; i++) vehicle.step(input, 1 / 60);
    expect(vehicle.speed).toBeGreaterThan(WARMUP_SPEED * 0.85);
    expect(Math.abs(vehicle.yawRate)).toBeLessThan(0.3);
    expect(vehicle.wheels.every((w) => w.surface === 'road' || w.surface === 'kerb')).toBe(true);
    for (const tyre of vehicle.stint.tyres) expect(tyre.tempC).toBeGreaterThan(80);
  });
});
