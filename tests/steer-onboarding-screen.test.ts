import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TiltStatus } from '@/input/tilt-steering';
import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { SteerOnboardingScreen } from '@/ui/screens/steer-onboarding';
import { STEER_LATER } from '@/ui/steer-onboarding-model';
import { stubMenuDom, type MenuNode } from './menu-dom-fixture';

afterEach(() => vi.unstubAllGlobals());

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The screen with a tilt request the test answers by hand. */
function setup() {
  const doc = stubMenuDom();
  let settings: Settings = { ...DEFAULT_SETTINGS };
  let answer: (status: TiltStatus) => void = () => {};
  const actions = {
    get: () => settings,
    set: vi.fn((s: Settings) => { settings = s; }),
    enableTilt: vi.fn(() => new Promise<TiltStatus>((resolve) => { answer = resolve; })),
    back: vi.fn(),
  };
  const screen = new SteerOnboardingScreen(actions);
  const proceed = vi.fn();
  screen.ask(proceed);
  screen.el.hidden = false;
  const node = (el: HTMLElement): MenuNode => el as unknown as MenuNode;
  const choice = (mode: string): MenuNode => node(screen.items().find((el) => node(el).attributes['data-steer-choice'] === mode)!);
  return { doc, screen, actions, proceed, choice, answer: (s: TiltStatus) => answer(s), root: node(screen.el), saved: () => settings };
}

describe('the steering question', () => {
  it('offers Finger and Tilt as real buttons, each with one plain line, and where to change it later', () => {
    const { screen, root } = setup();
    const [finger, tilt] = screen.items() as unknown as MenuNode[];
    expect(screen.items().map((el) => (el as unknown as MenuNode).tagName)).toEqual(['button', 'button']);
    expect(finger.textContent).toContain('Finger');
    expect(finger.textContent).toContain('Drag your thumb left or right on the left side of the screen.');
    expect(tilt.textContent).toContain('Tilt');
    expect(tilt.textContent).toContain('Tilt the phone like a steering wheel.');
    expect(root.textContent).toContain(STEER_LATER);
    expect(screen.id).toBe('steer');
    expect(root.attributes['aria-modal']).toBe('true');
  });

  it('puts Finger first so the menus focus it when the screen opens', () => {
    const { screen, choice } = setup();
    expect(screen.items()[0]).toBe(choice('drag') as unknown as HTMLElement);
  });

  it('saves Finger as drag, marked as chosen, and carries on to the race without asking for sensors', () => {
    const { actions, proceed, choice, saved } = setup();
    choice('drag').click();
    expect(actions.enableTilt).not.toHaveBeenCalled();
    expect(actions.set).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});

describe('choosing Tilt', () => {
  it('requests sensor access synchronously inside the tap, before anything else happens', () => {
    const { actions, proceed, choice, saved } = setup();
    choice('tilt').click();
    expect(actions.enableTilt).toHaveBeenCalledTimes(1); // no await between the click and the request
    expect(actions.set).not.toHaveBeenCalled();
    expect(proceed).not.toHaveBeenCalled();
    expect(saved().steerOnboarded).toBe(false);
  });

  it('ignores more taps while the phone is asking', () => {
    const { actions, choice, root } = setup();
    choice('tilt').click();
    choice('tilt').click();
    choice('drag').click();
    expect(actions.enableTilt).toHaveBeenCalledTimes(1);
    expect(actions.set).not.toHaveBeenCalled();
    expect(root.querySelectorAll('[data-steer-choice]').every((el) => el.attributes['aria-disabled'] === 'true')).toBe(true);
  });

  it('saves tilt and carries on to the race when access is granted', async () => {
    const { actions, proceed, choice, answer, saved } = setup();
    choice('tilt').click();
    answer('granted');
    await flush();
    expect(actions.set).toHaveBeenCalledTimes(1);
    expect(saved()).toMatchObject({ touchMode: 'tilt', steerOnboarded: true });
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('falls back to Finger when access is refused, saves that, and says so before the race', async () => {
    const { doc, screen, proceed, choice, answer, saved, root } = setup();
    choice('tilt').click();
    answer('denied');
    await flush();
    expect(saved()).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    expect(root.textContent).toContain('Motion access is off — using Finger. Change it in Settings > Steering.');
    expect(proceed).not.toHaveBeenCalled();
    const items = screen.items() as unknown as MenuNode[];
    expect(items.map((el) => el.textContent)).toEqual(['Start']);
    expect(doc.activeElement).toBe(items[0]);
    items[0].click();
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('uses the same fallback when the phone has no usable sensor', async () => {
    const { choice, answer, saved, root } = setup();
    choice('tilt').click();
    answer('unavailable');
    await flush();
    expect(saved()).toMatchObject({ touchMode: 'drag', steerOnboarded: true });
    expect(root.textContent).toContain('Tilt is not available on this device — using Finger. Change it in Settings > Steering.');
  });

  it('drops a late answer when the screen was closed meanwhile', async () => {
    const { screen, actions, proceed, choice, answer } = setup();
    choice('tilt').click();
    screen.el.hidden = true;
    answer('granted');
    await flush();
    expect(actions.set).not.toHaveBeenCalled();
    expect(proceed).not.toHaveBeenCalled();
  });
});

describe('leaving without choosing', () => {
  it('goes back to car select and stays unchosen', () => {
    const { screen, actions, proceed, saved } = setup();
    screen.back();
    expect(actions.back).toHaveBeenCalledTimes(1);
    expect(proceed).not.toHaveBeenCalled();
    expect(saved().steerOnboarded).toBe(false);
  });

  it('does not leave while the phone is asking for access', () => {
    const { screen, actions, choice } = setup();
    choice('tilt').click();
    screen.back();
    expect(actions.back).not.toHaveBeenCalled();
  });

  it('asks the question again from the start next time', async () => {
    const { screen, choice, answer, root } = setup();
    choice('tilt').click();
    answer('denied');
    await flush();
    expect(screen.items()).toHaveLength(1);
    screen.ask(vi.fn());
    expect(screen.items()).toHaveLength(2);
    expect(root.textContent).toContain(STEER_LATER);
    expect(root.textContent).not.toContain('using Finger');
  });
});
