import { FuelModel, FUEL_REFERENCE_L } from '@/physics/fuel';
import { BrakeModel } from '@/physics/brake-heat';
import { brakeContact, type BrakeContact } from '@/physics/brake-contact';
import { FlatSpots } from '@/physics/flat-spots';
import type { TyreResult } from '@/physics/tyre';
import { TyreModel, TYRE_START_C, type TyreCompound } from '@/physics/tyre-state';
import type { VehicleTelemetry } from '@/physics/types';
import type { SurfaceKind } from '@/track/track-query';

export interface StintStart { fuelL?: number; compound?: TyreCompound; tempC?: number; wear?: number }

/** Owned by one Vehicle, advanced only from fixed physics steps. */
export class VehicleStint {
  readonly fuel = new FuelModel();
  readonly tyreModel = new TyreModel();
  readonly tyres = this.tyreModel.tyres;
  readonly brakes = new BrakeModel();
  readonly flatSpots = new FlatSpots();
  private readonly brakeWork: BrakeContact = { powerW: 0, lockUse: 0 };
  completedLaps = 0;
  private previousS: number | null = null;

  reset(start: StintStart = {}): void {
    this.fuel.reset(start.fuelL ?? FUEL_REFERENCE_L);
    this.fitTyres(start.compound ?? 'soft', start.tempC ?? TYRE_START_C, start.wear ?? 0);
    this.brakes.reset();
    this.completedLaps = 0;
    this.previousS = null;
  }

  /** Replacing tyres preserves the tank and hot discs; a new stint resets them separately. */
  fitTyres(compound: TyreCompound, tempC = TYRE_START_C, wear = 0): void {
    this.tyreModel.fit(compound, tempC, wear);
    this.flatSpots.fit();
  }

  /** Actual longitudinal contact work, before rolling/surface drag; returns a stationary rotor lock. */
  advanceContact(wheel: number, loadN: number, mu: number, speed: number, driveN: number, brakeN: number,
    result: TyreResult, surface: SurfaceKind, dt: number): boolean {
    brakeContact(loadN, mu, speed, driveN, brakeN, result, this.brakeWork);
    this.brakes.advance(wheel, this.brakeWork.powerW, speed, dt);
    this.flatSpots.advance(wheel, this.brakeWork.lockUse, speed, loadN, surface, dt);
    return this.brakeWork.lockUse > 0;
  }

  /** Recovery preserves fuel and tyres, abandoning this lap's consumption sample. */
  placeOnTrack(s: number): void {
    this.previousS = s;
    this.fuel.cancelLap();
  }

  advance(t: VehicleTelemetry, dt: number, s: number, lineS: number, enginePedal = t.throttle): void {
    if (!(Number.isFinite(dt) && dt > 0)) return;
    const prev = this.previousS;
    if (prev !== null && prev < lineS && s >= lineS && s - prev < 50) {
      this.fuel.crossLine();
      this.completedLaps++;
    }
    this.previousS = s;
    this.fuel.advance(enginePedal, dt);
    this.tyreModel.advance(t, t.speed, dt);
  }
}
