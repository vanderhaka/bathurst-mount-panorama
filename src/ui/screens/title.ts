// Title screen over the live 3D background: typographic wordmark, circuit
// facts, main menu.
import { h } from '@/hud/dom';
import { flushRecords } from '@/race/records-queue';
import { hintBar, menuButton, type Screen, screenEl, STD_HINTS, valueRow } from '@/ui/screen';
import { ACTIVE_CIRCUIT, CIRCUITS, nextCircuit, switchCircuit } from '@/track/circuits';
import type { ShootoutMode } from '@/types/session';

export interface TitleActions {
  race(): void;
  shootout(mode: ShootoutMode): void;
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
  const dataUrl = CIRCUITS[ACTIVE_CIRCUIT].centrelineDataUrl;
  if (!dataUrl) return null;
  const credit = h('p', 'mn-tip');
  credit.append(h('a', undefined, { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, ['© OpenStreetMap contributors']),
    ' · ', h('a', undefined, { href: dataUrl, target: '_blank', rel: 'noopener' }, ['Circuit data (ODbL)']));
  return credit;
}

export class TitleScreen implements Screen {
  readonly id = 'title' as const;
  readonly el = screenEl('title', 'Main menu', 'mn-screen--side');
  private readonly featured: HTMLButtonElement;
  private readonly buttons: HTMLButtonElement[];
  private readonly circuitRow;
  private readonly credit = geometryCredit();

  constructor(actions: TitleActions) {
    const circuit = CIRCUITS[ACTIVE_CIRCUIT];
    // The page reloads for the other circuit: pending records are written first.
    this.circuitRow = valueRow('Circuit', (dir) => {
      flushRecords();
      switchCircuit(nextCircuit(ACTIVE_CIRCUIT, dir));
    });
    this.circuitRow.value.textContent = circuit.name;
    this.circuitRow.el.setAttribute('aria-label', `Circuit: ${circuit.name}. Left and right to change.`);
    this.featured = menuButton('Shootout Top 10', () => actions.shootout('shootoutTop10'), { variant: 'primary', aria: 'Shootout Top 10' });
    this.featured.classList.add('mn-shootout-feature');
    this.featured.replaceChildren(
      h('span', 'mn-shootout-feature__body', undefined, [
        h('span', 'mn-shootout-feature__eyebrow', undefined, ['Global competition']),
        h('span', 'mn-btn__label', undefined, ['Shootout Top 10']),
        h('span', 'mn-shootout-feature__detail', undefined, ['Bathurst · One flying lap · 3 total attempts']),
        h('span', 'mn-shootout-feature__cta', undefined, ['Enter competition', h('span', undefined, { 'aria-hidden': 'true' }, [' →'])]),
      ]),
      h('span', 'mn-shootout-feature__rank', { 'aria-hidden': 'true' }, ['10']),
    );
    this.buttons = [
      menuButton('Time trial', actions.race, { index: '01' }),
      menuButton('Shootout Arcade', () => actions.shootout('shootoutArcade'), { index: '02' }),
      menuButton('Settings', actions.settings, { index: '03' }),
      menuButton('Controls', actions.controls, { index: '04' }),
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
        h('nav', 'mn-list', { 'aria-label': 'Main menu' }, [this.featured,
          h('div', 'mn-title-options', undefined, [this.circuitRow.el, ...this.buttons]),
        ]),
        fullScreenTip(),
        this.credit,
      ]),
      hintBar(STD_HINTS.slice(0, 2)),
    );
  }

  items(): HTMLElement[] {
    return [this.featured, this.circuitRow.el, ...this.buttons, ...(this.credit ? Array.from(this.credit.querySelectorAll('a')) : [])];
  }

  back(): void {}
}
