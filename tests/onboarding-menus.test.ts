import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEVEL_PRESETS } from '@/race/driving-levels';
import type { MenuCallbacks, Menus } from '@/types/hud';
import { DEFAULT_SETTINGS, type SessionConfig, type Settings } from '@/types/session';
import { createMenus } from '@/ui';
import { findText, stubMenuDom, type MenuNode } from './menu-dom-fixture';

afterEach(() => vi.unstubAllGlobals());

interface Options {
  touch: boolean;
  settings?: Partial<Settings>;
}

/** The real menus on the DOM stand-in, opened on car select. Not onboarded unless `settings` say so. */
function open({ touch, settings }: Options) {
  const doc = stubMenuDom();
  vi.stubGlobal('navigator', { maxTouchPoints: touch ? 5 : 0 });
  const started: SessionConfig[] = [];
  const changes: Settings[] = [];
  const callbacks = {
    onStart: (c: SessionConfig) => started.push(c),
    onSettingsChange: (s: Settings) => changes.push(s),
    onPreviewCar: () => {},
  } as unknown as MenuCallbacks;
  const menus: Menus = createMenus();
  menus.mount(doc.body as unknown as HTMLElement, callbacks, { ...DEFAULT_SETTINGS, ...settings });
  menus.showCarSelect();
  const screen = (): string | undefined => doc.body.children[0].dataset.screen;
  const startRace = (): void => findText(doc.body, 'Start time trial')!.parent!.click();
  const rowEl = (key: string): MenuNode => doc.body.querySelectorAll('[data-onboarding-row]').find((el) => el.attributes['data-onboarding-row'] === key)!;
  const card = (level: string): MenuNode => doc.body.querySelectorAll('[data-level-card]').find((el) => el.attributes['data-level-card'] === level)!;
  const startButton = (): MenuNode => doc.body.querySelectorAll('[data-onboarding-start]')[0];
  const nextButton = (): MenuNode => doc.body.querySelectorAll('[data-onboarding-next]')[0];
  const lapLine = (): string => doc.body.querySelectorAll('.mn-onb__laps')[0].textContent;
  const choice = (mode: string): MenuNode => doc.body.querySelectorAll('[data-steer-choice]').find((el) => el.attributes['data-steer-choice'] === mode)!;
  return { doc, menus, started, changes, screen, startRace, rowEl, card, startButton, nextButton, lapLine, choice };
}

const selected = (n: MenuNode): string | undefined => n.attributes['aria-pressed'];
/** Rows on the step shown now (the other step stays in the DOM, hidden). */
const shownRows = (body: MenuNode): string[] => body.querySelectorAll('[data-onboarding-row]')
  .filter((el) => { for (let n: MenuNode | null = el; n; n = n.parent) if (n.hidden) return false; return true; })
  .map((el) => el.attributes['data-onboarding-row']);

describe('Start time trial before the first race setup has been seen', () => {
  it('shows step 1 with the Experienced card selected and focused, and does not start the race yet', () => {
    const { doc, started, screen, startRace, card } = open({ touch: false });
    startRace();
    expect(screen()).toBe('onboarding');
    expect(started).toHaveLength(0);
    expect(doc.activeElement).toBe(card('experienced'));
    expect(selected(card('experienced'))).toBe('true');
    expect(selected(card('casual'))).toBe('false');
  });

  it('starts a Casual pick with the Casual rules and marks the setup as seen', () => {
    const { started, changes, startRace, card, nextButton, startButton } = open({ touch: false });
    startRace();
    card('casual').click();
    expect(selected(card('casual'))).toBe('true');
    expect(started).toHaveLength(0);
    nextButton().click();
    startButton().click();
    expect(started).toHaveLength(1);
    expect(started[0].settings).toMatchObject({ ...LEVEL_PRESETS.casual, onboarded: true });
    expect(changes.at(-1)).toMatchObject({ ...LEVEL_PRESETS.casual, onboarded: true });
  });

  it('starts a Superstar pick with the Superstar rules', () => {
    const { started, startRace, card, nextButton, startButton } = open({ touch: false });
    startRace();
    card('superstar').click();
    nextButton().click();
    startButton().click();
    expect(started[0].settings).toMatchObject({ ...LEVEL_PRESETS.superstar, onboarded: true });
  });

  it('saves the changed Experienced racing line', () => {
    const { started, startRace, rowEl, nextButton, startButton } = open({ touch: false });
    startRace();
    expect(rowEl('racingLine').dataset.value).toBe('braking');
    rowEl('racingLine').click();
    expect(rowEl('racingLine').dataset.value).toBe('off');
    nextButton().click();
    startButton().click();
    expect(started[0].settings).toMatchObject({ ...LEVEL_PRESETS.experienced, racingLine: 'off', damage: 'full', onboarded: true });
  });

  it('shows no pedal rows to keyboard and controller players', () => {
    const { doc, startRace, nextButton } = open({ touch: false });
    startRace();
    nextButton().click();
    expect(shownRows(doc.body)).toEqual(['camera', 'graphics']);
  });

  it('shows the three Experienced rows, and none for Casual', () => {
    const { startRace, card, doc } = open({ touch: false });
    startRace();
    expect(doc.body.querySelectorAll('[data-onboarding-row]').map((el) => el.attributes['data-onboarding-row'])).toEqual(['racingLine', 'autoGears', 'damage', 'camera', 'graphics']);
    card('casual').click();
    expect(doc.body.querySelectorAll('[data-onboarding-row]').map((el) => el.attributes['data-onboarding-row'])).toEqual(['camera', 'graphics']);
  });

  it('moves between cards with left and right, selecting only on Enter', () => {
    const { menus, doc, startRace, card, rowEl } = open({ touch: false });
    startRace();
    menus.nav('right');
    expect(doc.activeElement).toBe(card('superstar'));
    expect(selected(card('superstar'))).toBe('false');
    menus.nav('accept');
    expect(selected(card('superstar'))).toBe('true');
    menus.nav('left');
    expect(doc.activeElement).toBe(card('experienced'));
    menus.nav('accept');
    menus.nav('down');
    expect(doc.activeElement).toBe(rowEl('racingLine'));
  });

  it('shows every rule on Custom and the level the laps count for', () => {
    const { startRace, card, rowEl, lapLine } = open({ touch: false });
    startRace();
    card('superstar').click();
    card('custom').click();
    expect(selected(card('custom'))).toBe('true');
    expect(lapLine()).toBe('Your laps count as: Superstar');
    expect(rowEl('abs').dataset.value).toBe('false');
    rowEl('abs').click();
    expect(rowEl('abs').dataset.value).toBe('true');
    expect(lapLine()).toBe('Your laps count as: Experienced');
    expect(selected(card('custom'))).toBe('true');
  });

  it('preselects Custom for a mix of rules that matches no level', () => {
    const { startRace, card } = open({ touch: false, settings: { abs: false } });
    startRace();
    expect(selected(card('custom'))).toBe('true');
  });

  it('starts on Auto on step 2, and saves a tier the player picks', () => {
    const { menus, doc, started, startRace, nextButton, rowEl, startButton } = open({ touch: false });
    startRace();
    nextButton().click();
    expect(doc.activeElement).toBe(rowEl('camera'));
    expect(rowEl('graphics').dataset.value).toBe('auto');
    menus.nav('down');
    menus.nav('left');
    menus.nav('down');
    expect(doc.activeElement).not.toBe(startButton());
    startButton().click();
    expect(started[0].settings).toMatchObject({ quality: 'high', autoQuality: false, onboarded: true });
  });

  it('keeps automatic quality from High when the player leaves Auto on step 2', () => {
    const { menus, started, startRace, nextButton, startButton } = open({ touch: false });
    startRace();
    nextButton().click();
    menus.nav('down');
    startButton().click();
    expect(started[0].settings).toMatchObject({ quality: 'high', autoQuality: true, onboarded: true });
  });

  it('goes back from step 2 to step 1 keeping the selection', () => {
    const { menus, doc, screen, started, startRace, card, nextButton } = open({ touch: false });
    startRace();
    card('superstar').click();
    nextButton().click();
    menus.nav('back');
    expect(screen()).toBe('onboarding');
    expect(selected(card('superstar'))).toBe('true');
    expect(doc.activeElement).toBe(card('superstar'));
    expect(started).toHaveLength(0);
  });

  it('goes back to car select from step 1, saving nothing, and asks again with the original values', () => {
    const { menus, started, changes, screen, startRace, card } = open({ touch: false });
    startRace();
    card('casual').click();
    menus.nav('back');
    expect(screen()).toBe('car');
    expect(started).toHaveLength(0);
    expect(changes).toHaveLength(0);
    startRace();
    expect(screen()).toBe('onboarding');
    expect(selected(card('experienced'))).toBe('true');
  });

  it('opens again on the selected card, not on the Back button the player left by', () => {
    const { doc, menus, screen, startRace, card } = open({ touch: false });
    startRace();
    const back = findText(doc.body.querySelectorAll('.mn-screen--onboarding')[0], 'Back')!.parent!;
    back.focus();
    back.click();
    expect(screen()).toBe('car');
    startRace();
    expect(doc.activeElement).toBe(card('experienced'));
    menus.nav('accept');
    expect(screen()).toBe('onboarding');
  });
});

describe('Start time trial after the setup has been seen', () => {
  it('starts the race straight away', () => {
    const { started, screen, startRace } = open({ touch: false, settings: { onboarded: true } });
    startRace();
    expect(started).toHaveLength(1);
    expect(screen()).not.toBe('onboarding');
  });
});

describe('the setup on a touch device', () => {
  it('reads Continue on step 2 and is followed by the steering question, then the race', () => {
    const { started, screen, startRace, nextButton, startButton, choice } = open({ touch: true });
    startRace();
    nextButton().click();
    expect(findText(startButton(), 'Continue')).not.toBeNull();
    startButton().click();
    expect(screen()).toBe('steer');
    expect(started).toHaveLength(0);
    choice('drag').click();
    expect(started).toHaveLength(1);
    expect(started[0].settings).toMatchObject({ onboarded: true, steerOnboarded: true });
  });

  it('asks touch players for pedals and auto-throttle on step 2, and saves analog for both pedals', () => {
    const { doc, menus, started, startRace, nextButton, startButton, rowEl } = open({ touch: true, settings: { steerOnboarded: true } });
    startRace();
    nextButton().click();
    expect(shownRows(doc.body)).toEqual(['camera', 'graphics', 'pedals', 'touchAutoThrottle']);
    expect(rowEl('pedals').attributes['aria-label']).toBe('Pedals: On/off. Left and right to change.');
    rowEl('pedals').focus();
    menus.nav('right');
    expect(rowEl('pedals').attributes['aria-label']).toBe('Pedals: Analog. Left and right to change.');
    rowEl('touchAutoThrottle').focus();
    menus.nav('right');
    startButton().click();
    expect(started[0].settings).toMatchObject({ touchAnalogThrottle: true, touchAnalogBrake: true, touchAutoThrottle: true });
  });

  it('reads Start and starts the race when the steering question is already answered', () => {
    const { started, startRace, nextButton, startButton } = open({ touch: true, settings: { steerOnboarded: true } });
    startRace();
    nextButton().click();
    expect(findText(startButton(), 'Start')).not.toBeNull();
    startButton().click();
    expect(started).toHaveLength(1);
    expect(started[0].settings.onboarded).toBe(true);
  });
});
