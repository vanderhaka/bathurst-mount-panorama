import { describe, expect, it, vi } from 'vitest';
import { CAR_SPECS } from '@/car/car-specs';
import { DEFAULT_HANDLING, tunedSpec } from '@/config/handling';
import { ProfileCache } from '@/game/profile-cache';
import { SessionProfiles } from '@/game/session-profiles';
import { Vehicle } from '@/physics/vehicle';
import { stintSpec } from '@/physics/stint-spec';
import type { VehicleInput } from '@/physics/types';
import { placeKerbs } from '@/track/kerbs';
import { computeRacingLine } from '@/track/racing-line';
import * as speedProfile from '@/track/speed-profile';
import { Track } from '@/track/track-model';
import type { World } from '@/world/world';

const track = new Track(), line = computeRacingLine(track), kerbs = placeKerbs(track, line);
const spec = CAR_SPECS.camaro;
const input: VehicleInput = { throttle: 0, brake: 0, steer: 0, shiftUp: false, shiftDown: false };
function car(): Vehicle { const v = new Vehicle(spec, track, kerbs); v.reset(1300, 0); return v; }

describe('owned runtime speed profiles', () => {
  it('never changes World.profile, another vehicle or the static per-car cache', () => {
    const profile = speedProfile.computeSpeedProfile(track, line, tunedSpec(spec, DEFAULT_HANDLING));
    const before = profile.speed.slice();
    const cache = new ProfileCache(() => ({ track, line, profile }) as World);
    const cached = cache.get('camaro');
    const v = car(), other = new SessionProfiles(car(), line), runtime = new SessionProfiles(v, line);
    const otherBefore = other.player.speed.slice();
    v.stint.fuel.reset(132);
    for (let i = 0; i < 360; i++) v.step(input, 1 / 360);
    runtime.update();
    expect(profile.speed).toEqual(before);
    expect(cache.get('camaro')).toBe(cached);
    expect(cached.player.speed).toEqual(before);
    expect(other.player.speed).toEqual(otherBefore);
    expect(runtime.player.speed).not.toBe(profile.speed);
    expect(runtime.player.lapTimeS).toBeGreaterThan(other.player.lapTimeS);
  });

  it('refreshes at most once per simulated second, keeps arrays in place and ignores render-only calls', () => {
    const v = car(), runtime = new SessionProfiles(v, line);
    const player = runtime.player, ai = runtime.ai;
    const speed = player.speed, corners = player.cornerLimit, aiSpeed = ai.speed;
    const spy = vi.spyOn(speedProfile, 'computeSpeedProfile');
    v.stint.fuel.reset(132);
    for (let i = 0; i < 500; i++) runtime.update();
    expect(spy).not.toHaveBeenCalled();
    for (let i = 0; i < 359; i++) { v.step(input, 1 / 360); runtime.update(); }
    expect(spy).not.toHaveBeenCalled();
    v.step(input, 1 / 360); runtime.update();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(runtime.player).toBe(player);
    expect(runtime.ai).toBe(ai);
    expect(player.speed).toBe(speed);
    expect(player.cornerLimit).toBe(corners);
    expect(ai.speed).toBe(aiSpeed);
    const next = speedProfile.computeSpeedProfile(track, line, stintSpec(tunedSpec(spec, v.handling), v.stint), speedProfile.LINE_PROFILE);
    expect(player.speed).toEqual(next.speed);
    expect(player.cornerLimit).toEqual(next.cornerLimit);
    expect(player.lapTimeS).toBe(next.lapTimeS);
    expect(player.topSpeed).toBe(next.topSpeed);
    spy.mockRestore();
  });
});
