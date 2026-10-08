// First race setup: shown once, on every device, when the player starts their first time trial.
// Step 1: how do you want to drive (a level card, plus the rules the card lets you choose).
// Step 2: camera and graphics. Rows edit a draft; only the final Start saves it (Back discards).
// On a touch device that still has to choose how to steer, the button reads Continue and the
// steering question follows.
import '@/ui/onboarding.css';
import { h } from '@/hud/dom';
import { type LevelChoice, levelChoice } from '@/race/driving-levels';
import type { Settings } from '@/types/session';
import { type LevelCard, levelCard, markSelected } from '@/ui/level-cards';
import {
  CUSTOM_ROWS, detailRows, EXPERIENCED_ROWS, lapLevelLine, LEVEL_CARDS, LEVEL_RECORDS_NOTE, needsOnboarding, ONBOARDING_LATER, ONBOARDING_ROWS,
  type OnboardingRow, selectLevel, stepRow, withOnboarded,
} from '@/ui/onboarding-model';
import { RowView } from '@/ui/onboarding-rows';
import { hintBar, kicker, menuButton, type Screen, screenEl } from '@/ui/screen';

export interface OnboardingActions {
  get(): Settings;
  set(s: Settings): void;
  /** Back to car select. */
  back(): void;
}

export class OnboardingScreen implements Screen {
  readonly id = 'onboarding' as const;
  readonly el = screenEl('onboarding', 'First race setup', 'mn-screen--dim');
  private readonly cards: LevelCard[];
  private readonly views = new Map<OnboardingRow, RowView>();
  private readonly title = h('h2', 'mn-h2');
  private readonly lapLine = h('p', 'mn-help mn-onb__laps', { role: 'status' });
  private readonly details = h('div', 'mn-onb__rows');
  private readonly stepOne = h('div', 'mn-onb__step');
  private readonly stepTwo = h('div', 'mn-onb__rows mn-onb__step', undefined, ONBOARDING_ROWS.map((r) => this.view(r).block));
  private readonly startLabel = h('span', 'mn-btn__label', undefined, ['Start']);
  private readonly start = menuButton('Start', () => this.finish(), { variant: 'primary' });
  private readonly next = menuButton('Next', () => this.setStep(2), { variant: 'primary' });
  private readonly backBtn = menuButton('Back', () => this.back());
  private draft: Settings;
  private choice: LevelChoice;
  private step: 1 | 2 = 1;
  /** The one card in the focus order: up / down leave the card row, left / right move between cards. */
  private cardFocus: LevelChoice;
  private proceed: () => void = () => {};

  constructor(private readonly actions: OnboardingActions) {
    this.draft = actions.get();
    this.choice = this.cardFocus = levelChoice(this.draft);
    this.start.replaceChildren(this.startLabel);
    this.start.setAttribute('data-onboarding-start', '');
    this.next.setAttribute('data-onboarding-next', '');
    this.cards = LEVEL_CARDS.map((c) => levelCard(c, () => this.pick(c), (dir) => this.moveCard(c, dir)));
    for (const c of this.cards) c.el.addEventListener('focus', () => (this.cardFocus = c.choice));
    for (const r of [...EXPERIENCED_ROWS, ...CUSTOM_ROWS]) this.view(r);
    this.stepOne.append(
      h('div', 'mn-onb__cards', { role: 'group', 'aria-label': 'Driving level' }, this.cards.map((c) => c.el)),
      h('div', 'mn-onb__notes', undefined, [h('p', 'mn-help', undefined, [LEVEL_RECORDS_NOTE]), this.lapLine]),
      this.details,
    );
    this.el.append(
      h('div', 'mn-panel mn-panel--onboarding', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('First time trial'), this.title]),
        this.stepOne,
        this.stepTwo,
        h('footer', 'mn-panel__foot', undefined, [
          h('p', 'mn-help', { role: 'status' }, [ONBOARDING_LATER]),
          h('div', 'mn-onb__buttons', undefined, [this.backBtn, this.next, this.start]),
        ]),
      ]),
      hintBar([['↑↓', 'DPAD', 'Select'], ['←→', 'DPAD', 'Change'], ['Enter', 'A', 'Confirm'], ['Esc', 'B', 'Back']]),
    );
    this.render();
  }

  private view(row: OnboardingRow): RowView {
    const v = new RowView(row, (r, dir) => this.change(r, dir));
    this.views.set(row, v);
    return v;
  }

  /** Whether the player has yet to see this screen. */
  required(settings: Settings): boolean {
    return needsOnboarding(settings);
  }

  /** Call before showing the screen. `proceed` runs once the choices are saved. */
  ask(proceed: () => void, startLabel: 'Start' | 'Continue'): void {
    this.proceed = proceed;
    this.draft = { ...this.actions.get() };
    this.choice = this.cardFocus = levelChoice(this.draft);
    this.startLabel.textContent = startLabel;
    this.step = 1;
    this.render();
  }

  private finish(): void {
    this.actions.set(withOnboarded(this.draft));
    this.proceed();
  }

  private pick(choice: LevelChoice): void {
    this.draft = selectLevel(this.draft, choice);
    this.choice = this.cardFocus = choice;
    this.render();
    this.cards[LEVEL_CARDS.indexOf(choice)].el.focus({ preventScroll: true });
  }

  private moveCard(from: LevelChoice, dir: -1 | 1): void {
    this.cards[LEVEL_CARDS.indexOf(from) + dir]?.el.focus({ preventScroll: true });
  }

  private change(row: OnboardingRow, dir: -1 | 1): void {
    this.draft = stepRow(this.draft, row, dir);
    this.render();
  }

  private setStep(step: 1 | 2): void {
    this.step = step;
    this.cardFocus = this.choice;
    this.render();
    this.items()[0].focus({ preventScroll: true });
  }

  private render(): void {
    const rows = detailRows(this.choice);
    markSelected(this.cards, this.choice);
    this.title.textContent = this.step === 1 ? 'How do you want to drive?' : 'Camera and graphics';
    this.stepOne.hidden = this.step !== 1;
    this.stepTwo.hidden = this.step !== 2;
    this.next.hidden = this.step !== 1;
    this.start.hidden = this.step !== 2;
    this.details.hidden = rows.length === 0;
    this.details.replaceChildren(...rows.map((r) => this.views.get(r)!.block));
    this.lapLine.hidden = this.choice !== 'custom';
    this.lapLine.textContent = lapLevelLine(this.draft);
    for (const v of this.views.values()) v.render(this.draft);
  }

  items(): HTMLElement[] {
    if (this.step === 2) return [...ONBOARDING_ROWS.map((r) => this.views.get(r)!.el), this.backBtn, this.start];
    const card = this.cards[LEVEL_CARDS.indexOf(this.cardFocus)].el;
    return [card, ...detailRows(this.choice).map((r) => this.views.get(r)!.el), this.backBtn, this.next];
  }

  back(): void {
    if (this.step === 2) this.setStep(1);
    else this.actions.back();
  }
}
