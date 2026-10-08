/** Every circuit, in title-screen cycle order. */
export const CIRCUIT_IDS = ['bathurst', 'adelaide'] as const;
export type CircuitId = (typeof CIRCUIT_IDS)[number];

interface CircuitInfo {
  name: string; city: string; title: readonly [string, string]; location: string; lengthM: number;
  facts: ReadonlyArray<readonly [string, string, string]>; altitudeDerate: number;
  /** Whether the HUD flags the elevation as an estimate. */
  elevationEstimated: boolean;
  /** The distributed ODbL centreline the title screen credits; null = no OSM credit shown. */
  centrelineDataUrl: string | null;
}

/** altitudeDerate: engine torque at the circuit's air density (Bathurst 700-870 m, docs/research/car-specs.md; Adelaide is at sea level). */
export const CIRCUITS = {
  bathurst: { name: 'Mount Panorama', city: 'Bathurst', title: ['Mount', 'Panorama'], location: 'Bathurst · New South Wales', lengthM: 6213,
    facts: [['Length', '6.213', 'km'], ['Turns', '23', ''], ['Elevation change', '174', 'm']], altitudeDerate: 0.92,
    elevationEstimated: false, centrelineDataUrl: null },
  adelaide: { name: 'Adelaide Parklands', city: 'Adelaide', title: ['Adelaide', 'Parklands'], location: 'Adelaide · South Australia', lengthM: 3219,
    facts: [['Length', '3.219', 'km'], ['Turns', '14', ''], ['Direction', 'Clockwise', '']], altitudeDerate: 1,
    elevationEstimated: true, centrelineDataUrl: '/data/adelaide-centerline.json' },
} as const satisfies Record<CircuitId, CircuitInfo>;

/** Last circuit chosen on the title screen; read when the address names none (a Home Screen launch opens "/"). */
const STORAGE_KEY = 'bathurst.circuit.v1';

export type CircuitStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): CircuitStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function parseCircuit(value: string | null | undefined): CircuitId | null {
  const name = value?.trim().toLowerCase();
  return CIRCUIT_IDS.find((id) => id === name) ?? null;
}

/** The circuit named by ?track= (any letter case), or null when it is missing or unknown. */
function explicitCircuit(search: string): CircuitId | null {
  return parseCircuit(new URLSearchParams(search).get('track'));
}

export function circuitFromSearch(search: string): CircuitId {
  return explicitCircuit(search) ?? 'bathurst';
}

export function loadSavedCircuit(storage: CircuitStorage | null = browserStorage()): CircuitId | null {
  try { return parseCircuit(storage?.getItem(STORAGE_KEY)); } catch { return null; }
}

/** Remembers the choice for the next launch. Returns false when storage is missing, blocked or full. */
export function saveCircuit(circuit: CircuitId, storage: CircuitStorage | null = browserStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STORAGE_KEY, circuit);
    return true;
  } catch { return false; }
}

/** An explicit ?track= wins, then the saved choice, then Bathurst on first launch. */
export function resolveCircuit(search: string, saved: CircuitId | null): CircuitId {
  return explicitCircuit(search) ?? saved ?? 'bathurst';
}

/** Every circuit but the default Bathurst is named in the address; Bathurst's parameter is dropped unless `keepParam`. */
export function circuitUrl(url: string, circuit: CircuitId, keepParam = false): string {
  const next = new URL(url);
  if (circuit !== 'bathurst' || keepParam) next.searchParams.set('track', circuit);
  else next.searchParams.delete('track');
  return next.href;
}

/** The neighbouring circuit in CIRCUIT_IDS order, wrapping at both ends. */
export function nextCircuit(current: CircuitId, dir: -1 | 1): CircuitId {
  return CIRCUIT_IDS[(CIRCUIT_IDS.indexOf(current) + dir + CIRCUIT_IDS.length) % CIRCUIT_IDS.length];
}

/**
 * Reloads on another circuit and remembers it. `replace` swaps the history entry, so Back leaves the
 * game instead of toggling circuits. If the choice can not be saved, the address names the circuit.
 */
export function switchCircuit(circuit: CircuitId, nav: Pick<Location, 'href' | 'replace'> = location, storage: CircuitStorage | null = browserStorage()): void {
  const saved = saveCircuit(circuit, storage);
  nav.replace(circuitUrl(nav.href, circuit, !saved));
}

export const ACTIVE_CIRCUIT: CircuitId = typeof location === 'undefined' ? 'bathurst' : resolveCircuit(location.search, loadSavedCircuit());
