// Title screen over the live 3D background: typographic wordmark, circuit
// facts, main menu.
import { h } from '@/hud/dom';
import { flushRecords } from '@/race/records-queue';
import { hintBar, menuButton, type Screen, screenEl, STD_HINTS, valueRow } from '@/ui/screen';
import { activeCircuit, CIRCUITS, nextCircuit, type CircuitId } from '@/track/circuits';
import type { ShootoutMode } from '@/types/session';
import { TitleBoard } from '@/ui/screens/title-board';
import { CircuitSwitchStatus } from '@/ui/screens/title-switch';

export interface TitleActions {
  /** Player-vs-AI race: opens the race setup. */
  raceSetup(): void;
  race(): void;
  shootout(mode: ShootoutMode): void;
  settings(): void;
  controls(): void;
  /** The Circuit row chose another circuit (the newest choice wins); the world is swapped in place. */
  switchCircuit(circuit: CircuitId): void;
}

/** Phones in the browser (not started from the Home Screen): how to get full screen. */
function fullScreenTip(): HTMLElement | null {
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone || !matchMedia('(pointer: coarse)').matches) return null;
  return h('p', 'mn-tip', undefined, ['For full screen, tap Share, then Add to Home Screen, and start the game from its icon.']);
}

function geometryCredit(circuit: CircuitId): HTMLElement | null {
  const dataUrl = CIRCUITS[circuit].centrelineDataUrl;
  if (!dataUrl) return null;
  const credit = h('p', 'mn-tip');
  credit.append(h('a', undefined, { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener' }, ['© OpenStreetMap contributors']),
    ' · ', h('a', undefined, { href: dataUrl, target: '_blank', rel: 'noopener' }, ['Circuit data (ODbL)']));
  return credit;
}

/** Only Bathurst runs the Shootout, so only its title offers it. */
export function titleHasShootout(circuit: CircuitId): boolean { return circuit === 'bathurst'; }

export class TitleScreen implements Screen {
  readonly id = 'title' as const;
  readonly el = screenEl('title', 'Main menu', 'mn-screen--side');
  private featured: HTMLButtonElement | null = null;
  private buttons: HTMLButtonElement[] = [];
  /** The buttons that start a race, shootout or time trial: not usable while another circuit is being built. */
  private starters: HTMLButtonElement[] = [];
  private readonly circuitRow;
  private readonly status = new CircuitSwitchStatus();
  private credit: HTMLElement | null = null;
  /** The live Top 10 on the right (Bathurst only: the Shootout runs there). */
  private board: TitleBoard | null = null;
  private shown = false;
  /** The circuit the row shows: the one being built when a switch is under way, else the active one. */
  private target: CircuitId = activeCircuit();
  private busy = false;
  private readonly kicker = h('p', 'mn-kicker');
  private readonly heading = h('h1', 'mn-title');
  private readonly facts = h('dl', 'mn-facts');

  constructor(private readonly actions: TitleActions, private readonly myAttemptIds?: () => ReadonlySet<string>) {
    this.circuitRow = valueRow('Circuit', (dir) => {
      flushRecords(); // pending records are written before the world is replaced
      this.target = nextCircuit(this.target, dir);
      this.showTarget();
      this.actions.switchCircuit(this.target);
    });
    this.render();
  }

  /** The Circuit row and the header (location, name, facts) name the circuit being switched to, so they always
   * agree with the map that loads on the right; the 3D scene behind changes when the new world is swapped in. */
  private showTarget(): void {
    const data = CIRCUITS[this.target];
    this.circuitRow.value.textContent = data.name;
    this.circuitRow.el.setAttribute('aria-label', `Circuit: ${data.name}. Left and right to change.`);
    this.kicker.replaceChildren(h('i', 'mn-kicker__bar', { 'aria-hidden': 'true' }), data.location);
    this.heading.replaceChildren(h('span', 'mn-title__a', undefined, [data.title[0]]), h('span', 'mn-title__b', undefined, [data.title[1]]));
    this.facts.replaceChildren(...data.facts.map(([k, v, u]) => h('div', 'mn-fact', undefined, [h('dt', undefined, undefined, [k]), h('dd', undefined, undefined, [v, u ? h('small', undefined, undefined, [u]) : null])])));
  }

  private guarded(action: () => void): () => void {
    return () => { if (!this.busy) action(); };
  }

  /** (Re)builds the screen for the active circuit: another circuit can be swapped in without a reload. */
  render(): void {
    const circuit = activeCircuit();
    this.target = circuit;
    this.busy = false;
    this.status.hide();
    this.showTarget();
    const { actions } = this;
    this.featured = titleHasShootout(circuit)
      ? menuButton('Shootout Top 10', this.guarded(() => actions.shootout('shootoutTop10')), { variant: 'primary', aria: 'Shootout Top 10' })
      : null;
    if (this.featured) {
      this.featured.classList.add('mn-shootout-feature');
      this.featured.replaceChildren(
        h('span', 'mn-shootout-feature__body', undefined, [
          h('span', 'mn-shootout-feature__eyebrow', undefined, ['Global competition']),
          h('span', 'mn-btn__label', undefined, ['Shootout Top 10']),
          h('span', 'mn-shootout-feature__detail', undefined, ['Bathurst · One flying lap · 3 attempts a week']),
          h('span', 'mn-shootout-feature__cta', undefined, ['Enter competition', h('span', undefined, { 'aria-hidden': 'true' }, [' →'])]),
        ]),
        h('span', 'mn-shootout-feature__rank', { 'aria-hidden': 'true' }, ['10']),
      );
    }
    this.board?.hide();
    this.board = titleHasShootout(circuit) ? new TitleBoard(this.myAttemptIds) : null;
    if (this.shown) this.board?.show();
    const options: Array<readonly [string, () => void, boolean]> = [
      ['Race', actions.raceSetup, true],
      ['Time trial', actions.race, true],
      ...(titleHasShootout(circuit) ? [['Shootout Arcade', () => actions.shootout('shootoutArcade'), true] as const] : []),
      ['Settings', actions.settings, false],
      ['Controls', actions.controls, false],
    ];
    this.buttons = options.map(([label, action, starts], i) => menuButton(label, starts ? this.guarded(action) : action, { index: String(i + 1).padStart(2, '0') }));
    this.starters = [...(this.featured ? [this.featured] : []), ...this.buttons.filter((_b, i) => options[i][2])];
    this.credit = geometryCredit(circuit);
    this.el.replaceChildren(
      h('div', 'mn-side', undefined, [
        this.kicker,
        this.heading,
        this.facts,
        h('nav', 'mn-list', { 'aria-label': 'Main menu' }, [this.featured,
          h('div', 'mn-title-options', undefined, [this.circuitRow.el, ...this.buttons]),
        ]),
        fullScreenTip(),
        this.credit,
      ]),
      // Right column: the map of the circuit being built (when switching) above the Top 10 board (Bathurst).
      h('div', 'mn-title-right', undefined, [this.status.el, this.board?.el ?? null]),
      hintBar(STD_HINTS.slice(0, 2)),
    );
  }

  /** The Circuit row element: it keeps focus across a re-render. */
  circuitItem(): HTMLElement { return this.circuitRow.el; }

  /** Another circuit is being built: progress 0..1 under the row; race and Shootout buttons wait. */
  showSwitch(target: CircuitId, progress: number, label: string): void {
    this.target = target;
    this.showTarget();
    this.setBusy(true);
    this.status.show(target, progress, label);
  }

  /** The switch was cancelled (the row went back to the active circuit) or failed (`message`). */
  endSwitch(message?: string): void {
    this.target = activeCircuit();
    this.showTarget();
    this.setBusy(false);
    if (message) this.status.fail(message); else this.status.hide();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    for (const b of this.starters) b.setAttribute('aria-disabled', String(busy));
  }

  items(): HTMLElement[] {
    return [...(this.featured ? [this.featured] : []), this.circuitRow.el, ...this.buttons, ...(this.credit ? Array.from(this.credit.querySelectorAll('a')) : [])];
  }

  onShow(): void { this.shown = true; this.board?.show(); }
  onHide(): void { this.shown = false; this.board?.hide(); }

  back(): void {}
}
