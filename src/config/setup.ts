import { CAR_SPECS, type CarKind } from '@/car/car-specs';

export interface CarSetup {
  brakeBiasFront: number;
  frontArbNpm: number;
  rearArbNpm: number;
  frontPressureKpa: number;
  rearPressureKpa: number;
}

export type SetupKey = keyof CarSetup;
export interface SetupRange { min: number; max: number; step: number }
const KEY = 'bathurst.setup.v1';

/** Bars and brake bias match the existing physics. Pressure is an estimated working value. */
export function defaultSetup(car: CarKind): CarSetup {
  return { brakeBiasFront: CAR_SPECS[car].brakeBiasFront, frontArbNpm: 52000, rearArbNpm: 26000, frontPressureKpa: 150, rearPressureKpa: 150 };
}

/** The three cars share Gen3 hardware. 120 kPa stays above the researched 117 kPa floor. */
export function setupRanges(car: CarKind): Record<SetupKey, SetupRange> {
  const bias = CAR_SPECS[car].brakeBiasFront;
  return {
    brakeBiasFront: { min: Number((bias - 0.08).toFixed(6)), max: Number((bias + 0.08).toFixed(6)), step: 0.005 },
    frontArbNpm: { min: 40000, max: 64000, step: 2000 },
    rearArbNpm: { min: 16000, max: 36000, step: 2000 },
    frontPressureKpa: { min: 120, max: 180, step: 5 },
    rearPressureKpa: { min: 120, max: 180, step: 5 },
  };
}

export function sanitiseSetup(car: CarKind, input: unknown): CarSetup {
  const setup = defaultSetup(car);
  const ranges = setupRanges(car);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return setup;
  const values = input as Record<string, unknown>;
  for (const key of Object.keys(setup) as SetupKey[]) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) setup[key] = Math.max(ranges[key].min, Math.min(ranges[key].max, value));
  }
  return setup;
}

export function stepSetup(car: CarKind, current: Readonly<CarSetup>, key: SetupKey, dir: -1 | 1): CarSetup {
  const next = sanitiseSetup(car, current);
  const range = setupRanges(car)[key];
  next[key] = Math.max(range.min, Math.min(range.max, Number((next[key] + dir * range.step).toFixed(6))));
  return next;
}

type SetupStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): SetupStorage | null {
  try { return localStorage; } catch { return null; }
}

/** One saved, bounded setup per car. Storage failures still leave the live setup usable. */
export class SetupStore {
  private readonly values = new Map<CarKind, Readonly<CarSetup>>();

  constructor(private readonly storage: SetupStorage | null = browserStorage()) {}

  get(car: CarKind): Readonly<CarSetup> {
    let setup = this.values.get(car);
    if (!setup) {
      let saved: unknown = null;
      try { saved = JSON.parse(this.storage?.getItem(`${KEY}.${car}`) ?? 'null') as unknown; } catch { /* malformed or unavailable */ }
      setup = Object.freeze(sanitiseSetup(car, saved));
      this.values.set(car, setup);
    }
    return setup;
  }

  set(car: CarKind, patch: Partial<CarSetup>): Readonly<CarSetup> {
    const setup = Object.freeze(sanitiseSetup(car, { ...this.get(car), ...patch }));
    this.values.set(car, setup);
    try { this.storage?.setItem(`${KEY}.${car}`, JSON.stringify(setup)); } catch { /* storage unavailable */ }
    return setup;
  }

  reset(car: CarKind): Readonly<CarSetup> { return this.set(car, defaultSetup(car)); }
}

let live: SetupStore | null = null;
function store(): SetupStore { return live ??= new SetupStore(); }
export function getSetup(car: CarKind): Readonly<CarSetup> { return store().get(car); }
export function setSetup(car: CarKind, patch: Partial<CarSetup>): Readonly<CarSetup> { return store().set(car, patch); }
export function resetSetup(car: CarKind): Readonly<CarSetup> { return store().reset(car); }
