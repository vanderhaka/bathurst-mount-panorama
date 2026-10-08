import { tyreHeat, type TyreHeatInput } from '@/physics/tyre-heat';

export type TyreCompound = 'soft' | 'hard';
export interface TyreReading { tempC: number; wear: number; grip: number }
export interface CompoundSpec {
  minC: number; maxC: number; peakGrip: number; coldLoss: number; hotLoss: number; wearRate: number; wearLoss: number;
}
/** Gen3 working temperatures/rates are unpublished: game estimates, not measured Dunlop curves. */
export const TYRE_COMPOUNDS: Readonly<Record<TyreCompound, Readonly<CompoundSpec>>> = {
  soft: { minC: 85, maxC: 105, peakGrip: 1, coldLoss: 0.25, hotLoss: 0.2, wearRate: 9e-5, wearLoss: 0.35 },
  hard: { minC: 90, maxC: 110, peakGrip: 0.99, coldLoss: 0.27, hotLoss: 0.18, wearRate: 5.4e-5, wearLoss: 0.28 },
};
export const TYRE_START_C = 52;
/** Physical ceiling: slick rubber blisters and reverts beyond ~150 C; hot grip loss is complete by maxC + 35. */
export const TYRE_MAX_C = 150;
const AMBIENT_C = 22;
/** Overheated wear grows 1x per 20 C above 110 C, up to 3x (reached at the ceiling). */
const OVERHEAT_WEAR_MAX = 3;
const COOL_BASE = 0.0036, COOL_SPEED = 0.00012;
const SURFACE_GAIN = 4.5, SURFACE_TAU_S = 2;
const unit = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const smooth = (v: number): number => { const x = unit(v); return x * x * (3 - 2 * x); };

/** Multiplier on the existing warm-slick mu; plateau and both transitions have continuous slope. */
export function tyreGrip(compound: TyreCompound, tempC: number, wear: number): number {
  const c = TYRE_COMPOUNDS[compound];
  const temp = Number.isFinite(tempC) ? tempC : AMBIENT_C;
  const cold = c.coldLoss * smooth((c.minC - temp) / 63);
  const hot = c.hotLoss * smooth((temp - c.maxC) / 35);
  return c.peakGrip * (1 - cold - hot) * (1 - c.wearLoss * unit(wear) ** 1.2);
}

/** Per-wheel carcass/surface state. Retains the HUD's calibrated heat mechanisms. */
export class TyreModel {
  readonly tyres: TyreReading[] = [0, 1, 2, 3].map(() => ({ tempC: TYRE_START_C, wear: 0, grip: 1 }));
  private readonly carcass = [0, 0, 0, 0];
  private readonly surface = [0, 0, 0, 0];
  private readonly heat = [0, 0, 0, 0];

  constructor(public compound: TyreCompound = 'soft', tempC = TYRE_START_C, wear = 0) {
    this.fit(compound, tempC, wear);
  }

  fit(compound: TyreCompound = 'soft', tempC = TYRE_START_C, wear = 0): void {
    this.compound = compound;
    const temp = Math.max(AMBIENT_C, Math.min(TYRE_MAX_C, Number.isFinite(tempC) ? tempC : TYRE_START_C));
    for (let i = 0; i < 4; i++) {
      this.carcass[i] = temp;
      this.surface[i] = 0;
      Object.assign(this.tyres[i], { tempC: temp, wear: unit(wear), grip: tyreGrip(compound, temp, wear) });
    }
  }

  /** With `wear` false the tyres behave as new at their best temperature; temperatures still evolve for display. */
  advance(input: TyreHeatInput, speed: number, dt: number, wear = true): void {
    if (!(Number.isFinite(dt) && dt > 0)) return;
    const v = Math.max(0, Math.abs(speed));
    const heat = tyreHeat(input, v, this.heat);
    const cool = COOL_BASE + COOL_SPEED * v;
    const k = 1 - Math.exp(-dt / SURFACE_TAU_S);
    const c = TYRE_COMPOUNDS[this.compound];
    for (let i = 0; i < 4; i++) {
      const tyre = this.tyres[i];
      this.carcass[i] = Math.min(TYRE_MAX_C, this.carcass[i] + (heat[i] - (this.carcass[i] - AMBIENT_C) * cool) * dt);
      this.surface[i] += (SURFACE_GAIN * heat[i] - this.surface[i]) * k;
      tyre.tempC = Math.min(TYRE_MAX_C, this.carcass[i] + this.surface[i]);
      const overheat = Math.min(OVERHEAT_WEAR_MAX, 1 + Math.max(0, tyre.tempC - 110) / 20);
      if (!wear) { tyre.grip = tyreGrip(this.compound, (c.minC + c.maxC) / 2, 0); continue; }
      tyre.wear = Math.min(1, tyre.wear + c.wearRate * heat[i] * overheat * dt);
      tyre.grip = tyreGrip(this.compound, tyre.tempC, tyre.wear);
    }
  }
}
