import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getSetup, resetSetup, setSetup, SetupStore } from '@/config/setup';
import { BINDINGS, PAD_MENU } from '@/input/bindings';
import { InputManager } from '@/input/input-manager';
import { updateRaceSetup } from '@/race/setup-controls';
import { SETUP_FIELDS, setupText } from '@/ui/setup-model';

class FakeWindow {
  private readonly listeners = new Map<string, Array<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: (e: unknown) => void): void { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  press(code: string, repeat = false): void {
    for (const fn of this.listeners.get('keydown') ?? []) fn({ code, repeat, preventDefault() {} });
  }
}

const saved = new Map<string, string>();
const storage = { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => { saved.set(key, value); } };
let buttons: number[] = [];
function pad(): Gamepad {
  return { id: 'Xbox', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })) } as unknown as Gamepad;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { getGamepads: () => [pad()] });
  buttons = [];
  resetSetup('camaro');
  resetSetup('mustang');
});
afterEach(() => vi.unstubAllGlobals());

describe('explicit in-race brake-bias buttons', () => {
  it('uses free keys and stick clicks, without a menu-button or driving-action collision', () => {
    const added = BINDINGS.filter((b) => b.action === 'brakeBiasRear' || b.action === 'brakeBiasFront');
    expect(added.map((b) => b.keys)).toEqual([['BracketLeft'], ['BracketRight']]);
    expect(added.map((b) => b.pad)).toEqual([{ kind: 'button', index: 10, label: 'LS click' }, { kind: 'button', index: 11, label: 'RS click' }]);
    const old = BINDINGS.filter((b) => !added.includes(b));
    for (const b of added) {
      for (const key of b.keys) expect(old.some((o) => o.keys.includes(key))).toBe(false);
      expect(old.some((o) => o.pad?.kind === 'button' && o.pad.index === b.pad?.index)).toBe(false);
      expect(Object.values(PAD_MENU)).not.toContain(b.pad?.index);
    }
  });

  it('changes and persists only the active car once per key press and announces its value', () => {
    const w = new FakeWindow();
    const input = new InputManager(w as unknown as Window);
    const say = vi.fn();
    w.press('BracketRight');
    expect(updateRaceSetup('camaro', input, say).brakeBiasFront).toBe(0.605);
    w.press('BracketRight', true);
    expect(updateRaceSetup('camaro', input, say).brakeBiasFront).toBe(0.605);
    expect(say).toHaveBeenCalledExactlyOnceWith('BRAKE BIAS 60.5% FRONT');
    expect(new SetupStore(storage).get('camaro').brakeBiasFront).toBe(0.605);
    expect(getSetup('mustang').brakeBiasFront).toBe(0.6);
    input.dispose();
  });

  it('handles gamepad press edges and clamps rather than wrapping', () => {
    const input = new InputManager(new FakeWindow() as unknown as Window);
    buttons = [10]; input.update(1 / 60);
    expect(updateRaceSetup('camaro', input, () => {}).brakeBiasFront).toBe(0.595);
    input.update(1 / 60);
    expect(updateRaceSetup('camaro', input, () => {}).brakeBiasFront).toBe(0.595);
    setSetup('camaro', { brakeBiasFront: 0.68 });
    buttons = [11]; input.update(1 / 60);
    expect(updateRaceSetup('camaro', input, () => {}).brakeBiasFront).toBe(0.68);
    buttons = [10, 11]; input.update(1 / 60);
    expect(updateRaceSetup('camaro', input, () => {}).brakeBiasFront).toBe(0.675); // only the newly pressed rear button
    input.dispose();
  });

  it('leaves setup unchanged while menus are open, and simultaneous new presses cancel', () => {
    const w = new FakeWindow();
    const input = new InputManager(w as unknown as Window);
    input.menusOpen = true;
    w.press('BracketLeft'); buttons = [11]; input.update(1 / 60);
    expect(updateRaceSetup('camaro', input, () => {}).brakeBiasFront).toBe(0.6);
    input.menusOpen = false;
    buttons = []; input.update(1 / 60);
    buttons = [10, 11]; input.update(1 / 60);
    expect(updateRaceSetup('camaro', input, () => {}).brakeBiasFront).toBe(0.6);
    input.dispose();
  });
});

describe('setup rows', () => {
  it('covers every setting and formats bias, bars and pressure with units', () => {
    expect(SETUP_FIELDS.map((f) => f.key)).toEqual(Object.keys(getSetup('camaro')));
    expect(setupText('brakeBiasFront', 0.605)).toBe('60.5% front');
    expect(setupText('frontArbNpm', 52000)).toBe('52 kN/m');
    expect(setupText('frontPressureKpa', 150)).toBe('150 kPa · 21.8 psi');
  });
});
