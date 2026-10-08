import { FuelModel, FUEL_REFERENCE_L } from '@/physics/fuel';
import { BrakeModel } from '@/physics/brake-heat';
import { brakeContact, type BrakeContact } from '@/physics/brake-contact';
import { FlatSpots } from '@/physics/flat-spots';
import type { TyreResult } from '@/physics/tyre';
import { TyreModel, TYRE_START_C, type TyreCompound } from '@/physics/tyre-state';
import type { VehicleTelemetry } from '@/physics/types';
import type { SurfaceKind } from '@/track/track-query';

export interface StintStart { fuelL?: number; compound?: TyreCompound; tempC?: number; wear?: number }

/** As LapTimer: a crossing completes a lap only after this fraction of the lap was driven forwards. */
const MIN_COVERED = 0.9;
/** A larger position change in one step is a teleport, never driving (m). */
const MAX_STEP_M = 50;

/** Owned by one Vehicle, advanced only from fixed physics steps. */
export class VehicleStint {
  readonly fuel = new FuelModel();
  readonly tyreModel = new TyreModel();
  readonly tyres = this.tyreModel.tyres;
  readonly brakes = new BrakeModel();
  readonly flatSpots = new FlatSpots();
  private readonly brakeWork: BrakeContact = { powerW: 0, lockUse: 0 };
  completedLaps = 0;
  /** Refuels at the line over this vehicle's life; never reset, so readers can spot a new one. */
  refuels = 0;
  /** The stint's starting load: what a refuel at the line fills the tank back to. */
  private startFuelL = FUEL_REFERENCE_L;
  private previousS: number | null = null;
  /** Forward metres since the last line crossing; null until the stint's first crossing, which always counts. */
  private covered: number | null = null;

  reset(start: StintStart = {}): void {
    this.startFuelL = start.fuelL ?? FUEL_REFERENCE_L;
    this.fuel.reset(this.startFuelL);
    this.fitTyres(start.compound ?? 'soft', start.tempC ?? TYRE_START_C, start.wear ?? 0);
    this.brakes.reset();
    this.completedLaps = 0;
    this.previousS = null;
    this.covered = null;
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

  /** `s` is the car's track distance; the timing line is at `lineS` on a lap of `lapLength` metres. */
  advance(t: VehicleTelemetry, dt: number, s: number, lineS: number, lapLength: number, enginePedal = t.throttle): void {
    if (!(Number.isFinite(dt) && dt > 0)) return;
    if (this.previousS !== null) this.crossLine(this.previousS, s, lineS, lapLength);
    this.previousS = s;
    this.fuel.advance(enginePedal, dt);
    this.tyreModel.advance(t, t.speed, dt);
  }

  /**
   * Counts a forward crossing of the line in wrapped lap distance (a line at distance 0 works). Like
   * LapTimer, reversing back over the line and driving forward again restarts the lap instead. A
   * counted lap refuels the car when the tank cannot finish the next one.
   */
  private crossLine(prev: number, s: number, lineS: number, lapLength: number): void {
    // The signed step wraps into (-L/2, L/2], never [0, L): a car is never half a lap from its last step.
    let ds = (s - prev) % lapLength;
    if (ds > lapLength / 2) ds -= lapLength;
    else if (ds <= -lapLength / 2) ds += lapLength;
    if (!(Math.abs(ds) < MAX_STEP_M)) return;
    if (this.covered !== null && ds > 0) this.covered += ds;
    const before = (((prev - lineS) % lapLength) + lapLength) % lapLength;
    if (ds <= 0 || before + ds < lapLength) return;
    const after = before + ds - lapLength;
    if (this.covered === null || this.covered - after >= lapLength * MIN_COVERED) {
      this.fuel.crossLine();
      this.completedLaps++;
      if (this.fuel.refuelIfShort(this.startFuelL, lapLength)) this.refuels++;
    } else this.fuel.cancelLap();
    this.covered = after;
  }
}
