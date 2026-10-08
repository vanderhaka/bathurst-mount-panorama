export type CircuitId = 'bathurst' | 'adelaide';

/** altitudeDerate: engine torque at the circuit's air density (Bathurst 700-870 m, docs/research/car-specs.md; Adelaide is at sea level). */
export const CIRCUITS = {
  bathurst: { name: 'Mount Panorama', city: 'Bathurst', title: ['Mount', 'Panorama'], location: 'Bathurst · New South Wales', lengthM: 6213,
    facts: [['Length', '6.213', 'km'], ['Turns', '23', ''], ['Elevation change', '174', 'm']], altitudeDerate: 0.92 },
  adelaide: { name: 'Adelaide Parklands', city: 'Adelaide', title: ['Adelaide', 'Parklands'], location: 'Adelaide · South Australia', lengthM: 3219,
    facts: [['Length', '3.219', 'km'], ['Turns', '14', ''], ['Direction', 'Clockwise', '']], altitudeDerate: 1 },
} as const;

/** Last circuit chosen on the title screen; read when the address names none (a Home Screen launch opens "/"). */
const STORAGE_KEY = 'bathurst.circuit.v1';

export type CircuitStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): CircuitStorage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function parseCircuit(value: string | null | undefined): CircuitId | null {
  const name = value?.trim().toLowerCase();
  return name === 'adelaide' || name === 'bathurst' ? name : null;
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

/** Adelaide is named in the address; Bathurst is the default, so its parameter is dropped unless `keepParam`. */
export function circuitUrl(url: string, circuit: CircuitId, keepParam = false): string {
  const next = new URL(url);
  if (circuit === 'adelaide' || keepParam) next.searchParams.set('track', circuit);
  else next.searchParams.delete('track');
  return next.href;
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
