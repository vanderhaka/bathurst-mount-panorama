import { afterEach, describe, expect, it, vi } from 'vitest';
import { CIRCUIT_IDS, activeCircuit, circuitFromSearch, circuitUrl, commitCircuit, nextCircuit, loadSavedCircuit, saveCircuit, setActiveCircuit, type CircuitStorage } from '@/track/circuits';

/** In-memory stand-in for localStorage. */
function memoryStorage(initial: Record<string, string> = {}): CircuitStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

const blocked: CircuitStorage = {
  getItem: () => { throw new DOMException('denied', 'SecurityError'); },
  setItem: () => { throw new DOMException('full', 'QuotaExceededError'); },
};
/** Storage that reads fine but is full: the saved choice can not be changed. */
const full = (saved: string): CircuitStorage => ({ getItem: () => saved, setItem: blocked.setItem });

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('?track= parsing', () => {
  it('ignores letter case and stray spaces', () => {
    for (const value of ['adelaide', 'Adelaide', 'ADELAIDE', '%20adelaide%20']) expect(circuitFromSearch(`?track=${value}`), value).toBe('adelaide');
    for (const value of ['bathurst', 'Bathurst', 'BATHURST']) expect(circuitFromSearch(`?track=${value}`), value).toBe('bathurst');
  });

  it('still defaults to Bathurst without a valid name', () => {
    expect(circuitFromSearch('')).toBe('bathurst');
    expect(circuitFromSearch('?track=')).toBe('bathurst');
    expect(circuitFromSearch('?track=unknown&quality=low')).toBe('bathurst');
  });
});

describe('saved circuit', () => {
  it('is read back after it is saved', () => {
    const storage = memoryStorage();
    expect(loadSavedCircuit(storage)).toBeNull();
    expect(saveCircuit('adelaide', storage)).toBe(true);
    expect(loadSavedCircuit(storage)).toBe('adelaide');
    saveCircuit('bathurst', storage);
    expect(loadSavedCircuit(storage)).toBe('bathurst');
  });

  it('ignores an unknown stored value', () => {
    expect(loadSavedCircuit(memoryStorage({ 'bathurst.circuit.v1': 'monza' }))).toBeNull();
  });

  it('never throws when storage is missing, blocked or full', () => {
    expect(loadSavedCircuit(null)).toBeNull();
    expect(loadSavedCircuit(blocked)).toBeNull();
    expect(saveCircuit('adelaide', null)).toBe(false);
    expect(saveCircuit('adelaide', blocked)).toBe(false);
  });
});

describe('which circuit opens', () => {
  it.each(['adelaide', 'gold-coast'].flatMap((saved) =>
    ['', '?quality=low', '?track=', '?track=unknown&shootout=top10'].map((search) => ({ saved, search })),
  ))('opens Bathurst for "$search" with $saved saved', async ({ saved, search }) => {
    vi.stubGlobal('location', { search });
    vi.stubGlobal('localStorage', memoryStorage({ 'bathurst.circuit.v1': saved }));
    vi.resetModules();
    const { activeCircuit } = await import('@/track/circuits');
    expect(activeCircuit()).toBe('bathurst');
  });

  it('opens Bathurst on first launch', () => {
    expect(circuitFromSearch('')).toBe('bathurst');
  });

  it.each([
    { search: '?track=bathurst', saved: 'adelaide', expected: 'bathurst' },
    { search: '?track=Adelaide', saved: 'bathurst', expected: 'adelaide' },
    { search: '?track=gold-coast', saved: 'adelaide', expected: 'gold-coast' },
  ])('opens $expected for "$search" with $saved saved', async ({ search, saved, expected }) => {
    vi.stubGlobal('location', { search });
    vi.stubGlobal('localStorage', memoryStorage({ 'bathurst.circuit.v1': saved }));
    vi.resetModules();
    const { activeCircuit } = await import('@/track/circuits');
    expect(activeCircuit()).toBe(expected);
  });
});

describe('switching circuit in place', () => {
  const env = (href: string, storage: CircuitStorage | null, title = 'Gen3 time trial — Mount Panorama') => {
    const doc = { title };
    return { doc, replaceState: vi.fn<(data: unknown, unused: string, url: string) => void>(), location: { href }, storage };
  };
  const commit = (circuit: Parameters<typeof commitCircuit>[0], e: ReturnType<typeof env>) =>
    commitCircuit(circuit, { location: e.location, history: { replaceState: e.replaceState }, storage: e.storage, doc: e.doc });

  afterEach(() => setActiveCircuit('bathurst'));

  it('changes the live circuit without touching the address of the page by itself', () => {
    expect(activeCircuit()).toBe('bathurst');
    setActiveCircuit('gold-coast');
    expect(activeCircuit()).toBe('gold-coast');
  });

  it('commits a circuit: live value, saved choice and address (replaceState, so Back does not switch circuits again)', () => {
    const e = env('https://example.com/?quality=low', memoryStorage());
    commit('adelaide', e);
    expect(activeCircuit()).toBe('adelaide');
    expect(e.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', 'https://example.com/?quality=low&track=adelaide');
    expect(loadSavedCircuit(e.storage)).toBe('adelaide');
    expect(e.doc.title).toBe('Adelaide Parklands — Gen3 time trial');
  });

  it('returns to Bathurst without ?track= once Bathurst is the saved choice', () => {
    const e = env('https://example.com/?track=adelaide&quality=low', memoryStorage({ 'bathurst.circuit.v1': 'adelaide' }));
    commit('bathurst', e);
    const target = e.replaceState.mock.calls[0][2];
    expect(target).toBe('https://example.com/?quality=low');
    expect(circuitFromSearch(new URL(target).search)).toBe('bathurst');
    expect(activeCircuit()).toBe('bathurst');
  });

  it('names Bathurst in the address when the choice can not be saved, so it still wins', () => {
    const e = env('https://example.com/?track=adelaide', full('adelaide'));
    commit('bathurst', e);
    const target = e.replaceState.mock.calls[0][2];
    expect(target).toBe('https://example.com/?track=bathurst');
    expect(circuitFromSearch(new URL(target).search)).toBe('bathurst');
  });

  it('still commits when storage is blocked or missing', () => {
    commit('gold-coast', env('https://example.com/', blocked));
    expect(activeCircuit()).toBe('gold-coast');
    const e = env('https://example.com/', null);
    commit('adelaide', e);
    expect(e.replaceState).toHaveBeenCalledExactlyOnceWith(null, '', 'https://example.com/?track=adelaide');
  });

  it('keeps circuitUrl behaviour: other options survive, Bathurst drops the parameter unless asked to keep it', () => {
    expect(circuitUrl('https://example.com/?track=adelaide&quality=low#race', 'bathurst')).toBe('https://example.com/?quality=low#race');
    expect(circuitUrl('https://example.com/?quality=low#race', 'bathurst', true)).toBe('https://example.com/?quality=low&track=bathurst#race');
  });
});

describe('N-way circuit choice', () => {
  const n = CIRCUIT_IDS.length;

  it('steps forward and back through CIRCUIT_IDS and wraps at both ends', () => {
    CIRCUIT_IDS.forEach((id, i) => {
      expect(nextCircuit(id, 1)).toBe(CIRCUIT_IDS[(i + 1) % n]);
      expect(nextCircuit(id, -1)).toBe(CIRCUIT_IDS[(i + n - 1) % n]);
    });
    expect(nextCircuit(CIRCUIT_IDS[n - 1], 1)).toBe(CIRCUIT_IDS[0]);
    expect(nextCircuit(CIRCUIT_IDS[0], -1)).toBe(CIRCUIT_IDS[n - 1]);
  });

  it('round-trips every id through ?track=', () => {
    for (const id of CIRCUIT_IDS) expect(circuitFromSearch(`?track=${id}`), id).toBe(id);
  });

  it('keeps track= in the address for every non-default id and drops it for Bathurst', () => {
    for (const id of CIRCUIT_IDS) {
      const url = new URL(circuitUrl('https://example.com/?quality=low', id));
      expect(url.searchParams.get('track'), id).toBe(id === 'bathurst' ? null : id);
    }
  });
});
