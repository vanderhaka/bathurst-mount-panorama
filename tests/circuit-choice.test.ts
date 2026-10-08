import { describe, expect, it, vi } from 'vitest';
import { circuitFromSearch, circuitUrl, loadSavedCircuit, resolveCircuit, saveCircuit, switchCircuit, type CircuitStorage } from '@/track/circuits';

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
  it('opens Bathurst on first launch', () => {
    expect(resolveCircuit('', null)).toBe('bathurst');
  });

  it('opens the saved circuit when the address names none, as a Home Screen launch does', () => {
    expect(resolveCircuit('', 'adelaide')).toBe('adelaide');
    expect(resolveCircuit('?quality=low', 'adelaide')).toBe('adelaide');
    expect(resolveCircuit('?track=unknown', 'adelaide')).toBe('adelaide');
  });

  it('lets an explicit ?track= win over the saved circuit, in either direction', () => {
    expect(resolveCircuit('?track=bathurst', 'adelaide')).toBe('bathurst');
    expect(resolveCircuit('?track=Adelaide', 'bathurst')).toBe('adelaide');
    expect(resolveCircuit('?track=adelaide', null)).toBe('adelaide');
  });
});

describe('switching circuit', () => {
  const page = (href: string) => ({ href, replace: vi.fn<(url: string) => void>(), assign: vi.fn<(url: string) => void>() });

  it('replaces the history entry, so Back does not switch circuits again, and saves the choice', () => {
    const nav = page('https://example.com/?quality=low'), storage = memoryStorage();
    switchCircuit('adelaide', nav, storage);
    expect(nav.replace).toHaveBeenCalledExactlyOnceWith('https://example.com/?quality=low&track=adelaide');
    expect(nav.assign).not.toHaveBeenCalled();
    expect(loadSavedCircuit(storage)).toBe('adelaide');
  });

  it('returns to Bathurst without ?track= once Bathurst is the saved choice', () => {
    const nav = page('https://example.com/?track=adelaide&quality=low'), storage = memoryStorage({ 'bathurst.circuit.v1': 'adelaide' });
    switchCircuit('bathurst', nav, storage);
    const target = nav.replace.mock.calls[0][0];
    expect(target).toBe('https://example.com/?quality=low');
    expect(resolveCircuit(new URL(target).search, loadSavedCircuit(storage))).toBe('bathurst');
  });

  it('names Bathurst in the address when the choice can not be saved, so it still wins', () => {
    const nav = page('https://example.com/?track=adelaide');
    switchCircuit('bathurst', nav, full('adelaide'));
    const target = nav.replace.mock.calls[0][0];
    expect(target).toBe('https://example.com/?track=bathurst');
    expect(resolveCircuit(new URL(target).search, 'adelaide')).toBe('bathurst');
  });

  it('still switches when storage is blocked', () => {
    const nav = page('https://example.com/');
    switchCircuit('adelaide', nav, blocked);
    expect(nav.replace).toHaveBeenCalledExactlyOnceWith('https://example.com/?track=adelaide');
  });

  it('keeps circuitUrl behaviour: other options survive, Bathurst drops the parameter unless asked to keep it', () => {
    expect(circuitUrl('https://example.com/?track=adelaide&quality=low#race', 'bathurst')).toBe('https://example.com/?quality=low#race');
    expect(circuitUrl('https://example.com/?quality=low#race', 'bathurst', true)).toBe('https://example.com/?quality=low&track=bathurst#race');
  });
});
