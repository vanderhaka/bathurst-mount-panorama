import { afterEach, expect, it, vi } from 'vitest';
import type { MenuCallbacks } from '@/types/hud';
import { DEFAULT_SETTINGS } from '@/types/session';
import { createMenus } from '@/ui';
import { findText, stubMenuDom } from './menu-dom-fixture';

afterEach(() => vi.unstubAllGlobals());

it('ends the paused race before Results > Change car opens car select', () => {
  const doc = stubMenuDom();
  const calls: string[] = [];
  const callbacks = { onQuitToMenu: () => calls.push('quit'), onPreviewCar: () => calls.push('preview'), onResults() {} } as unknown as MenuCallbacks;
  const menus = createMenus();
  menus.mount(doc.body as unknown as HTMLElement, callbacks, DEFAULT_SETTINGS);
  menus.showPause();
  menus.showResults([], {});
  findText(doc.body, 'Change car')!.parent!.click();
  expect(calls).toEqual(['quit', 'preview']);
  expect(doc.body.children[0].dataset.screen).toBe('car');
  menus.dispose();
});
