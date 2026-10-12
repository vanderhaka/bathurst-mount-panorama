import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MenuCallbacks } from '@/types/hud';
import type { RaceResult } from '@/types/race';
import { DEFAULT_SETTINGS, type SessionConfig } from '@/types/session';
import { createMenus } from '@/ui';
import { findText, stubMenuDom, type MenuNode } from './menu-dom-fixture';

afterEach(() => vi.unstubAllGlobals());

function open() {
  const doc = stubMenuDom();
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  const started: SessionConfig[] = [];
  const calls: string[] = [];
  const callbacks = {
    onStart: (c: SessionConfig) => started.push(c), onPreviewCar: () => {}, onQuitToMenu: () => calls.push('quit'), onRestart: () => calls.push('restart'),
  } as unknown as MenuCallbacks;
  const menus = createMenus();
  menus.mount(doc.body as unknown as HTMLElement, callbacks, { ...DEFAULT_SETTINGS, onboarded: true });
  menus.showTitle();
  const screen = (): string | undefined => doc.body.children[0].dataset.screen;
  /** The button or text inside one screen (Shootout and time-trial screens share some labels). */
  const within = (id: string, label: string): MenuNode => findText(doc.body.querySelectorAll(`.mn-screen--${id}`)[0], label)!.parent!;
  const click = (label: string, id = ''): void => (id ? within(id, label) : findText(doc.body, label)!.parent!).click();
  return { doc, menus, started, calls, screen, click, within };
}

const result = (finished: boolean): RaceResult => ({
  circuit: 'Mount Panorama', laps: 3, skill: 'medium',
  rows: [{ position: 1, number: '97', name: 'You', car: 'camaro', isPlayer: true, lapsDone: finished ? 3 : 1, finished, finishTimeS: finished ? 300 : null, gapS: null, lapsDown: 0, bestLapS: 100 }],
});

describe('race menus', () => {
  it('goes title -> setup -> car select -> a race config with the chosen options', () => {
    const { doc, started, screen, click, within } = open();
    click('Race');
    expect(screen()).toBe('raceSetup');
    doc.body.querySelectorAll('[data-race-option]').find((el) => el.attributes['data-race-option'] === 'opponents')!.click();
    click('Choose car', 'raceSetup');
    expect(screen()).toBe('car');
    expect(within('car', 'Start race')).toBeDefined();
    click('Start race', 'car');
    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({ mode: 'race', race: { opponents: 7, laps: 3, skill: 'medium' } });
  });

  it('walks back from car select to setup to the title', () => {
    const { menus, screen, click } = open();
    click('Race');
    click('Choose car', 'raceSetup');
    menus.nav('back');
    expect(screen()).toBe('raceSetup');
    menus.nav('back');
    expect(screen()).toBe('title');
  });

  it('offers Race again after the flag and Back (to pause) when opened mid-race', () => {
    const { menus, calls, screen, click, within } = open();
    menus.showRaceResult(result(true));
    expect(screen()).toBe('raceResults');
    expect(within('raceResults', 'You finished P1')).toBeDefined();
    expect(within('raceResults', 'Race again').hidden).toBe(false);
    click('Change race', 'raceResults');
    expect(calls).toEqual(['quit']);
    expect(screen()).toBe('raceSetup');
    menus.showPause();
    menus.showRaceResult(result(false));
    expect(within('raceResults', 'Running order')).toBeDefined();
    expect(within('raceResults', 'Race again').hidden).toBe(true);
    menus.nav('back');
    expect(screen()).toBe('pause');
  });
});
