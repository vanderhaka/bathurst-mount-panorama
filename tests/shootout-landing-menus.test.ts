import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuCallbacks, Menus } from '@/types/hud';
import type { CircuitId } from '@/track/circuits';
import { DEFAULT_SETTINGS, type ShootoutMode } from '@/types/session';
import { stubMenuDom } from './menu-dom-fixture';

let activeMenus: Menus | null = null;

afterEach(() => {
  activeMenus?.dispose();
  activeMenus = null;
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function open(circuit: CircuitId) {
  const doc = stubMenuDom();
  vi.stubGlobal('navigator', { maxTouchPoints: 0 });
  vi.stubGlobal('location', { search: `?track=${circuit}` });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ available: false, entries: [] }), { status: 503 })));
  vi.resetModules();
  const { createMenus } = await import('@/ui');
  const callbacks: MenuCallbacks = {
    onStart() {}, onResume() {}, onRestart() {}, onResetCar() {}, onToggleTuner() {},
    onQuitToMenu() {}, onSettingsChange() {}, onPreviewCar() {},
  };
  const menus = createMenus();
  activeMenus = menus;
  menus.mount(document.body, callbacks, DEFAULT_SETTINGS);
  menus.showTitle();
  const title = doc.body.querySelector('.mn-screen--title');
  if (!title) throw new Error('The title menu did not mount.');
  const screen = () => doc.body.children[0]?.dataset.screen;
  return { doc, menus, title, screen };
}

describe('Bathurst Shootout menu', () => {
  it('offers both modes at Bathurst and starts navigation at Top 10', async () => {
    const { doc, title } = await open('bathurst');
    expect(title.querySelectorAll('.mn-btn__label').map((el) => el.textContent)).toEqual([
      'Shootout Top 10', 'Time trial', 'Shootout Arcade', 'Settings', 'Controls',
    ]);
    expect(title.querySelectorAll('.mn-btn__idx').map((el) => el.textContent)).toEqual(['01', '02', '03', '04']);
    expect(doc.activeElement).toBe(title.querySelector('.mn-shootout-feature'));
  });

  it.each(['adelaide', 'gold-coast'] as const)('omits both modes and their navigation items at %s', async (circuit) => {
    const { doc, menus, title } = await open(circuit);
    expect(title.textContent).not.toContain('Shootout');
    expect(title.querySelectorAll('.mn-btn__label').map((el) => el.textContent)).toEqual(['Time trial', 'Settings', 'Controls']);
    expect(title.querySelectorAll('.mn-btn__idx').map((el) => el.textContent)).toEqual(['01', '02', '03']);
    const items = [...title.querySelectorAll('.mn-item'), ...title.querySelectorAll('a')];
    for (const item of items) {
      expect(doc.activeElement).toBe(item);
      menus.nav('down');
    }
    expect(doc.activeElement).toBe(items[0]);
  });
});

describe('Shootout entry', () => {
  const modes: ShootoutMode[] = ['shootoutTop10', 'shootoutArcade'];

  it.each((['adelaide', 'gold-coast'] as const).flatMap((circuit) => modes.map((mode) => ({ circuit, mode }))))(
    'keeps $mode calls at $circuit on the title menu and preserves time trial', async ({ circuit, mode }) => {
      const { doc, menus, screen } = await open(circuit);
      menus.showShootout(mode);
      expect(screen()).toBe('title');
      menus.showCarSelect();
      const car = doc.body.querySelector('.mn-screen--car');
      expect(car?.querySelectorAll('.mn-btn__label').map((el) => el.textContent)).toContain('Start time trial');
    },
  );

  it.each(modes)('opens %s at Bathurst', async (mode) => {
    const { menus, screen } = await open('bathurst');
    menus.showShootout(mode);
    expect(screen()).toBe('shootout');
  });
});
