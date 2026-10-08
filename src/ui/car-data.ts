// Car-select data derived from CAR_SPECS and LIVERY_PRESETS (single sources of truth).
import { circuitCarSpec, type CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS } from '@/car/liveries';
import { peakPowerKw } from '@/hud/indicators';
import { CIRCUITS, type CircuitId } from '@/track/circuits';

export const CAR_ORDER: CarKind[] = ['camaro', 'mustang', 'supra', 'torana'];

export interface CarSheet {
  kind: CarKind;
  name: string;
  maker: string;
  rows: Array<[string, string]>;
  /** Small print under the spec rows. */
  note: string;
}

/**
 * Published Gen3 ratings (parity: same for every Gen3 car), docs/research/car-specs.md
 * [S1][S3][S5], and the Torana's 1979 rating (Wheels 1980, section 12). The physics derates them for the circuit's altitude (circuitCarSpec),
 * so the menu shows these figures and notes the in-game output at the selected circuit.
 */
const RATED: Record<CarKind, { kw: number; hp: number; nm: number }> = {
  camaro: { kw: 447, hp: 600, nm: 660 },
  mustang: { kw: 447, hp: 600, nm: 660 },
  supra: { kw: 447, hp: 600, nm: 660 },
  torana: { kw: 289, hp: 388, nm: 475 },
};

const nf = new Intl.NumberFormat('en-AU');

export function carSheet(kind: CarKind, circuit: CircuitId): CarSheet {
  const spec = circuitCarSpec(kind, circuit);
  const rated = RATED[kind];
  const inGame = peakPowerKw(spec.engine.torqueCurve);
  return {
    kind,
    name: spec.shortName,
    maker: spec.displayName.split(' ')[0],
    rows: [
      ['Engine', spec.engine.label],
      ['Power', `${rated.kw} kW  /  ${rated.hp} hp`],
      ['Torque', `${rated.nm} Nm`],
      ['Weight', `${nf.format(spec.massKg)} kg`],
      ['Redline', `${nf.format(spec.engine.redlineRpm)} rpm`],
    ],
    note: CIRCUITS[circuit].altitudeDerate < 1
      ? `Rated output. Altitude-derated in game at ${CIRCUITS[circuit].city} (~${Math.round(inGame.kw)} kW).`
      : `Rated output. No altitude derate in game at ${CIRCUITS[circuit].city} (~${Math.round(inGame.kw)} kW).`,
  };
}

/** Livery presets offered for every car (the contract exposes one count). */
export const LIVERY_COUNT = Math.min(...CAR_ORDER.map((k) => LIVERY_PRESETS[k].length));

export function hexColour(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
