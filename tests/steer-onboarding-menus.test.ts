import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TiltStatus } from '@/input/tilt-steering';
import type { MenuCallbacks, Menus } from '@/types/hud';
import { DEFAULT_SETTINGS, type SessionConfig, type Settings } from '@/types/session';
import { createMenus } from '@/ui';
import { findText, stubMenuDom, type MenuNode } from './menu-dom-fixture';

afterEach(() => vi.unstubAllGlobals());

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Options {
  touch: boolean;
  settings?: Partial<Settings>;
  /** What the phone answers when the Tilt tap asks for motion access; undefined = no callback wired. */
  tilt?: TiltStatus;
}

/** The real menus on the DOM stand-in, opened on car select. */
function open({ touch, settings, tilt }: Options) {
  const doc = stubMenuDom();
  vi.stubGlobal('navigator', { maxTouchPoints: touch ? 5 : 0 });
  const started: SessionConfig[] = [];
  const changes: Settings[] = [];
  const asked = vi.fn();
  const callbacks = {
    onStart: (c: SessionConfig) => started.push(c),
    onSettingsChange: (s: Settings) => changes.push(s),
    onPreviewCar: () => {},
    ...(tilt ? { onEnableTilt: () => { asked(); return Promise.resolve(tilt); } } : {}),
  } as unknown as MenuCallbacks;
  const menus: Menus = createMenus();
  menus.mount(doc.body as unknown as HTMLElement, callbacks, { ...DEFAULT_SETTINGS, onboarded: true, ...settings });
  menus.showCarSelect();
  const screen = (): string | undefined => doc.body.children[0].dataset.screen;
  const startRace = (): void => findText(doc.body, 'Start time trial')!.parent!.click();
  const choice = (mode: string): MenuNode => doc.body.querySelectorAll('[data-steer-choice]').find((el) => el.attributes['data-steer-choice'] === mode)!;
  return { doc, menus, started, changes, asked, screen, startRace, choice };
}

describe('Start time trial on a touch device that has not chosen', () => {
  it('shows the steering question first, with Finger focused, and does not start the race yet', () => {
    const { doc, started, screen, startRace, choice } = open({ touch: true });
    startRace();
    expect(screen()).toBe('steer');
    expect(started).toHaveLength(0);
    expect(doc.activeElement).toBe(choice('drag'));
  });

  it('starts the race with Finger after one tap, saving the choice', () => {
    const { menus, started, changes, startRace, choice } = open({ touch: true });
    startRace();
    choice('drag').click();
    expect(started).toHaveLength(1);
    expect(started[0].settings).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    expect(changes.at(-1)).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    expect(menus.isOpen()).toBe(false);
  });

  it('starts the race with Tilt once the phone grants motion access, asking inside the tap', async () => {
    const { started, asked, startRace, choice } = open({ touch: true, tilt: 'granted' });
    startRace();
    choice('tilt').click();
    expect(asked).toHaveBeenCalledTimes(1); // synchronously inside the click
    expect(started).toHaveLength(0);
    await flush();
    expect(started).toHaveLength(1);
    expect(started[0].settings).toMatchObject({ touchMode: 'tilt', steerOnboarded: true });
  });

  it('falls back to Finger when motion access is refused, and starts only after the player has read it', async () => {
    const { doc, menus, started, changes, startRace, choice } = open({ touch: true, tilt: 'denied' });
    startRace();
    choice('tilt').click();
    await flush();
    expect(started).toHaveLength(0);
    expect(menus.isOpen()).toBe(true);
    expect(changes.at(-1)).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    // The first race setup also has a Start button, so look only inside the steering question.
    const steer = doc.body.querySelectorAll('.mn-screen--steer')[0];
    expect(findText(steer, 'Start')).not.toBeNull();
    findText(steer, 'Start')!.parent!.click();
    expect(started).toHaveLength(1);
    expect(started[0].settings).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
  });

  it('treats a menu with no sensor hook as unavailable and falls back to Finger', async () => {
    const { started, changes, startRace, choice } = open({ touch: true });
    startRace();
    choice('tilt').click();
    await flush();
    expect(changes.at(-1)).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    expect(started).toHaveLength(0);
  });

  it('works with the keyboard and the controller: down then accept picks Tilt', async () => {
    const { doc, menus, started, startRace, choice } = open({ touch: true, tilt: 'granted' });
    startRace();
    expect(doc.activeElement).toBe(choice('drag'));
    menus.nav('down');
    expect(doc.activeElement).toBe(choice('tilt'));
    menus.nav('accept');
    await flush();
    expect(started[0].settings.touchMode).toBe('tilt');
  });

  it('goes back to car select on Back and asks again next time', () => {
    const { menus, started, changes, screen, startRace } = open({ touch: true });
    startRace();
    menus.nav('back');
    expect(screen()).toBe('car');
    expect(started).toHaveLength(0);
    expect(changes).toHaveLength(0);
    startRace();
    expect(screen()).toBe('steer');
  });

  it('asks once only: a second race after a choice starts straight away', () => {
    const { menus, started, screen, startRace, choice } = open({ touch: true });
    startRace();
    choice('drag').click();
    menus.showCarSelect();
    startRace();
    expect(started).toHaveLength(2);
    expect(screen()).not.toBe('steer');
  });
});

describe('Start time trial when there is nothing to ask', () => {
  it('starts straight away on a desktop, which never sees the question', () => {
    const { started, screen, startRace } = open({ touch: false });
    startRace();
    expect(started).toHaveLength(1);
    expect(screen()).not.toBe('steer');
    expect(started[0].settings.steerOnboarded).toBe(false);
  });

  it('starts straight away when the player already chose', () => {
    const { started, startRace } = open({ touch: true, settings: { steerOnboarded: true } });
    startRace();
    expect(started).toHaveLength(1);
  });

  it('starts straight away for a player who changed the touch mode before this update', () => {
    const { started, startRace } = open({ touch: true, settings: { touchMode: 'buttons' } });
    startRace();
    expect(started).toHaveLength(1);
    expect(started[0].settings.touchMode).toBe('buttons');
  });
});

describe('Start warm-up in a Shootout on a touch device', () => {
  const startWarmUp = (menus: Menus, doc: ReturnType<typeof stubMenuDom>): void => {
    menus.showShootout('shootoutArcade');
    menus.showCarSelect();
    findText(doc.body, 'Start warm-up')!.parent!.click();
    // Where the warm-up starts comes first, then the steering question.
    doc.body.querySelectorAll('[data-warmup-start]').find((el) => el.attributes['data-warmup-start'] === 'grid')!.click();
  };

  it('asks Finger or Tilt before every run, marking the current choice', () => {
    const { doc, menus, started, screen, choice } = open({ touch: true, settings: { touchMode: 'tilt', steerOnboarded: true } });
    startWarmUp(menus, doc);
    expect(screen()).toBe('steer');
    expect(started).toHaveLength(0);
    expect(choice('tilt').classList.contains('is-current')).toBe(true);
    expect(choice('drag').classList.contains('is-current')).toBe(false);
    choice('drag').click();
    expect(started[0]).toMatchObject({ mode: 'shootoutArcade', settings: { touchMode: 'drag' } });
  });

  it('does not ask a player who chose Buttons in Settings, or a desktop', () => {
    const buttons = open({ touch: true, settings: { touchMode: 'buttons', steerOnboarded: true } });
    startWarmUp(buttons.menus, buttons.doc);
    expect(buttons.started).toHaveLength(1);
    vi.unstubAllGlobals();
    const desktop = open({ touch: false });
    startWarmUp(desktop.menus, desktop.doc);
    expect(desktop.started).toHaveLength(1);
  });
});
