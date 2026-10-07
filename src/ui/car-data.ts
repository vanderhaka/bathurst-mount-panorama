// Car-select data derived from CAR_SPECS and LIVERY_PRESETS (single sources of truth).
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS } from '@/car/liveries';
import { peakPowerKw } from '@/hud/indicators';

export const CAR_ORDER: CarKind[] = ['camaro', 'mustang', 'supra'];

export interface CarSheet {
  kind: CarKind;
  name: string;
  maker: string;
  rows: Array<[string, string]>;
  /** Small print under the spec rows. */
  note: string;
}

/**
 * Published Gen3 ratings (parity: same for every car), docs/research/car-specs.md
 * [S1][S3][S5]. CAR_SPECS holds the Bathurst altitude-derated curve the physics uses,
 * so the menu shows these figures and notes the in-game output separately.
 */
const RATED: Record<CarKind, { kw: number; hp: number; nm: number }> = {
  camaro: { kw: 447, hp: 600, nm: 660 },
  mustang: { kw: 447, hp: 600, nm: 660 },
  supra: { kw: 447, hp: 600, nm: 660 },
};

const nf = new Intl.NumberFormat('en-AU');

export function carSheet(kind: CarKind): CarSheet {
  const spec = CAR_SPECS[kind];
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
    note: `Rated output. Altitude-derated in game at Bathurst (~${Math.round(inGame.kw)} kW).`,
  };
}

/** Livery presets offered for every car (the contract exposes one count). */
export const LIVERY_COUNT = Math.min(...CAR_ORDER.map((k) => LIVERY_PRESETS[k].length));

export function hexColour(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}
