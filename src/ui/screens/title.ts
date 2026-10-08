// Title screen over the live 3D background: typographic wordmark, circuit
// facts, main menu.
import { h } from '@/hud/dom';
import { hintBar, menuButton, type Screen, screenEl, STD_HINTS, valueRow } from '@/ui/screen';
import { ACTIVE_CIRCUIT, CIRCUITS, circuitUrl } from '@/track/circuits';

export interface TitleActions {
  race(): void;
  settings(): void;
  controls(): void;
}

/** Phones in the browser (not started from the Home Screen): how to get full screen. */
function fullScreenTip(): HTMLElement | null {
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || !matchMedia('(pointer: coarse)').matches) return null;
  return h('p', 'mn-tip', undefined, ['For full screen, tap Share, then Add to Home Screen, and start the game from its icon.']);
}

function geometryCredit(): HTMLElement | null {
  if (ACTIVE_CIRCUIT !== 'adelaide') return null;
  const credit = h('p', 'mn-tip');
  credit.append(h('a', undefined, { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, ['© OpenStreetMap contributors']),
    ' · ', h('a', undefined, { href: '/data/adelaide-centerline.json', target: '_blank', rel: 'noopener' }, ['Circuit data (ODbL)']));
  return credit;
}

export class TitleScreen implements Screen {
  readonly id = 'title' as const;
  readonly el = screenEl('title', 'Main menu', 'mn-screen--side');
  private readonly buttons: HTMLButtonElement[];
  private readonly circuitRow;
  private readonly credit = geometryCredit();

  constructor(actions: TitleActions) {
    const circuit = CIRCUITS[ACTIVE_CIRCUIT];
    this.circuitRow = valueRow('Circuit', () => location.assign(circuitUrl(location.href, ACTIVE_CIRCUIT === 'bathurst' ? 'adelaide' : 'bathurst')));
    this.circuitRow.value.textContent = circuit.name;
    this.circuitRow.el.setAttribute('aria-label', `Circuit: ${circuit.name}. Left and right to change.`);
    this.buttons = [
      menuButton('Time trial', actions.race, { index: '01', variant: 'primary' }),
      menuButton('Settings', actions.settings, { index: '02' }),
      menuButton('Controls', actions.controls, { index: '03' }),
    ];
    this.el.append(
      h('div', 'mn-side', undefined, [
        h('p', 'mn-kicker', undefined, [h('i', 'mn-kicker__bar', { 'aria-hidden': 'true' }), circuit.location]),
        h('h1', 'mn-title', undefined, [h('span', 'mn-title__a', undefined, [circuit.title[0]]), h('span', 'mn-title__b', undefined, [circuit.title[1]])]),
        h(
          'dl',
          'mn-facts',
          undefined,
          circuit.facts.map(([k, v, u]) => h('div', 'mn-fact', undefined, [h('dt', undefined, undefined, [k]), h('dd', undefined, undefined, [v, u ? h('small', undefined, undefined, [u]) : null])])),
        ),
        h('nav', 'mn-list', { 'aria-label': 'Main menu' }, [this.buttons[0], this.circuitRow.el, ...this.buttons.slice(1)]),
        fullScreenTip(),
        this.credit,
      ]),
      hintBar(STD_HINTS.slice(0, 2)),
    );
  }

  items(): HTMLElement[] {
    return [this.buttons[0], this.circuitRow.el, ...this.buttons.slice(1), ...(this.credit ? Array.from(this.credit.querySelectorAll('a')) : [])];
  }

  back(): void {}
}
