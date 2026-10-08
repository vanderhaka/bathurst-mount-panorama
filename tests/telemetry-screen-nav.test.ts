import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuCallbacks } from '@/types/hud';
import { DEFAULT_SETTINGS } from '@/types/session';
import type { LapTelemetry, SessionTelemetry } from '@/types/telemetry';
import { createMenus } from '@/ui';
import { TelemetryScreen } from '@/ui/screens/telemetry';
import { findText, type MenuDocument, type MenuNode, stubMenuDom } from './menu-dom-fixture';

const LENGTH = 6213;

function lap(lapNumber: number, pace: number): LapTelemetry {
  const samples = Array.from({ length: 101 }, (_, i) => ({ distanceM: (i / 100) * LENGTH, timeS: i * pace, speedKmh: 150 + (i % 7), throttle: (i % 5) / 4, brake: (i % 3) / 4 }));
  return { lapNumber, lengthM: LENGTH, timeS: samples[100].timeS, valid: true, samples };
}

/** Bathurst has 23 named turns; the screen lists one row per turn. */
function data(): SessionTelemetry {
  const best = lap(2, 1.24);
  return { laps: [best, lap(3, 1.25)], best, ghost: best, corners: Array.from({ length: 23 }, (_, i) => ({ distanceM: 100 + i * 260, turn: i + 1, name: `Corner ${i + 1}` })) };
}

const text = (el: HTMLElement): string => (el as unknown as MenuNode).textContent;

let doc: MenuDocument;
beforeEach(() => { doc = stubMenuDom(); });
afterEach(() => vi.unstubAllGlobals());

describe('telemetry screen keyboard and gamepad reach', () => {
  it('makes every chart and corner row a focus stop between the selectors and Back', () => {
    const screen = new TelemetryScreen(data, () => {}, () => 'kmh');
    screen.onShow();
    const items = screen.items();
    expect(items.length).toBe(2 + 3 + 23 + 1);
    expect(items.slice(2, 5).map((el) => (el as unknown as MenuNode).tagName)).toEqual(['figure', 'figure', 'figure']);
    const rows = items.slice(5, -1);
    expect(rows.map((el) => (el as unknown as MenuNode).tagName)).toEqual(Array(23).fill('tr'));
    expect(text(rows[0])).toMatch(/^T1 Corner 1/);
    expect(text(rows[22])).toMatch(/^T23 Corner 23/);
    for (const el of items.slice(2, -1)) expect(el.getAttribute('tabindex')).toBe('0');
    expect(text(items.at(-1)!)).toBe('Back');
  });

  it('reaches the last corner with down presses alone and scrolls it into view', () => {
    const menus = createMenus();
    const callbacks = { telemetry: data } as unknown as MenuCallbacks;
    menus.mount(doc.body as unknown as HTMLElement, callbacks, DEFAULT_SETTINGS);
    menus.showPause();
    findText(doc.body, 'Telemetry')!.parent!.click();
    expect(text(doc.activeElement as unknown as HTMLElement)).toContain('Lap to inspect');
    for (let i = 0; i < 2 + 3 + 22; i++) menus.nav('down');
    const focused = doc.activeElement!;
    expect(focused.tagName).toBe('tr');
    expect(focused.textContent).toMatch(/^T23 Corner 23/);
    expect(focused.scrolledIntoView).toBeGreaterThan(0);
    menus.nav('down');
    expect(doc.activeElement!.textContent).toBe('Back');
    menus.dispose();
  });
});
