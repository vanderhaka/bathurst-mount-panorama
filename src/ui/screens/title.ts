// Title screen over the live 3D background: typographic wordmark, circuit
// facts, main menu.
import { h } from '@/hud/dom';
import { hintBar, menuButton, type Screen, screenEl, STD_HINTS } from '@/ui/screen';

export interface TitleActions {
  race(): void;
  settings(): void;
  controls(): void;
}

const FACTS: Array<[string, string, string]> = [
  ['Length', '6.213', 'km'],
  ['Turns', '23', ''],
  ['Elevation change', '174', 'm'],
];

/** Phones in the browser (not started from the Home Screen): how to get full screen. */
function fullScreenTip(): HTMLElement | null {
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || !matchMedia('(pointer: coarse)').matches) return null;
  return h('p', 'mn-tip', undefined, ['For full screen, tap Share, then Add to Home Screen, and start the game from its icon.']);
}

export class TitleScreen implements Screen {
  readonly id = 'title' as const;
  readonly el = screenEl('title', 'Main menu', 'mn-screen--side');
  private readonly buttons: HTMLButtonElement[];

  constructor(actions: TitleActions) {
    this.buttons = [
      menuButton('Time trial', actions.race, { index: '01', variant: 'primary' }),
      menuButton('Settings', actions.settings, { index: '02' }),
      menuButton('Controls', actions.controls, { index: '03' }),
    ];
    this.el.append(
      h('div', 'mn-side', undefined, [
        h('p', 'mn-kicker', undefined, [h('i', 'mn-kicker__bar', { 'aria-hidden': 'true' }), 'Bathurst · New South Wales']),
        h('h1', 'mn-title', undefined, [h('span', 'mn-title__a', undefined, ['Mount']), h('span', 'mn-title__b', undefined, ['Panorama'])]),
        h(
          'dl',
          'mn-facts',
          undefined,
          FACTS.map(([k, v, u]) => h('div', 'mn-fact', undefined, [h('dt', undefined, undefined, [k]), h('dd', undefined, undefined, [v, u ? h('small', undefined, undefined, [u]) : null])])),
        ),
        h('nav', 'mn-list', { 'aria-label': 'Main menu' }, this.buttons),
        fullScreenTip(),
      ]),
      hintBar(STD_HINTS.slice(0, 2)),
    );
  }

  items(): HTMLElement[] {
    return this.buttons;
  }

  back(): void {}
}
