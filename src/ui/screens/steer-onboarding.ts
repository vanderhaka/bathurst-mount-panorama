// Steering question: asked once, on a touch device, when the player starts their first
// time trial. Finger or Tilt, then the race starts. Tilt asks the phone for motion access
// inside the same tap; if the phone says no, Finger is saved and a note says so first.
import '@/ui/steer.css';
import { h } from '@/hud/dom';
import type { TiltStatus } from '@/input/tilt-steering';
import { touchControlsAvailable } from '@/input/touch-capability';
import type { Settings } from '@/types/session';
import { hintBar, kicker, menuButton, type Screen, screenEl } from '@/ui/screen';
import {
  needsSteerOnboarding, STEER_CHOICES, STEER_LATER, STEER_WAITING, tiltFallbackNote, withSteerChoice, type SteerChoice,
} from '@/ui/steer-onboarding-model';

export interface SteerOnboardingActions {
  get(): Settings;
  set(s: Settings): void;
  /** Asks the phone for motion access. Called synchronously inside the Tilt tap: iOS needs the gesture. */
  enableTilt(): Promise<TiltStatus>;
  /** Back to car select. */
  back(): void;
}

/** ask: two choices; wait: the phone is asking for motion access; note: Tilt failed, Finger is set. */
type Phase = 'ask' | 'wait' | 'note';

export class SteerOnboardingScreen implements Screen {
  readonly id = 'steer' as const;
  readonly el = screenEl('steer', 'Choose how to steer', 'mn-screen--dim');
  private readonly panel = h('div', 'mn-panel mn-panel--steer');
  private readonly title = h('h2', 'mn-h2');
  private readonly choices: HTMLButtonElement[];
  private readonly group: HTMLElement;
  private readonly help = h('p', 'mn-help', { role: 'status' });
  private readonly start = menuButton('Start', () => this.proceed(), { variant: 'primary' });
  private proceed: () => void = () => {};
  private phase: Phase = 'ask';

  constructor(private readonly actions: SteerOnboardingActions) {
    this.choices = STEER_CHOICES.map(({ mode, label, help }) => {
      const btn = menuButton(label, () => this.choose(mode));
      btn.classList.add('mn-steer__choice');
      btn.setAttribute('data-steer-choice', mode);
      btn.append(h('span', 'mn-steer__help', undefined, [help]));
      return btn;
    });
    this.group = h('div', 'mn-steer__choices', { role: 'group', 'aria-label': 'Steering method' }, this.choices);
    this.panel.append(
      h('header', 'mn-panel__head', undefined, [kicker('Touch controls'), this.title]),
      this.group,
      h('footer', 'mn-panel__foot', undefined, [this.help, this.start]),
    );
    this.el.append(
      this.panel,
      hintBar([['←→', 'DPAD', 'Choose'], ['Enter', 'A', 'Confirm'], ['Esc', 'B', 'Back']]),
    );
    this.render('ask');
  }

  /** Whether this player is asked before the race: a touch screen that has not chosen yet, or before every
   * Shootout run (the one choice worth confirming before a timed attempt) unless they picked Buttons in Settings. */
  required(settings: Settings, shootout = false): boolean {
    const touch = touchControlsAvailable();
    return shootout ? touch && settings.touchMode !== 'buttons' : needsSteerOnboarding(settings, touch);
  }

  /** Call before showing the screen. `proceed` starts the race once the choice is saved. */
  ask(proceed: () => void): void {
    this.proceed = proceed;
    this.render('ask');
  }

  items(): HTMLElement[] {
    return this.phase === 'note' ? [this.start] : this.choices;
  }

  private choose(mode: SteerChoice): void {
    if (this.phase !== 'ask') return;
    if (mode === 'drag') return this.finish('drag');
    // The request goes out before anything else: iOS only prompts for a call made inside the tap.
    const answer = this.actions.enableTilt();
    this.render('wait');
    void answer.then((status) => this.answered(status));
  }

  private answered(status: TiltStatus): void {
    if (this.el.hidden) return; // the menus closed while the phone was asking
    const note = tiltFallbackNote(status);
    if (note === null) return this.finish('tilt');
    this.actions.set(withSteerChoice(this.actions.get(), 'drag'));
    this.render('note', note);
    this.start.focus({ preventScroll: true });
  }

  private finish(mode: SteerChoice): void {
    this.actions.set(withSteerChoice(this.actions.get(), mode));
    this.proceed();
  }

  private render(phase: Phase, note = ''): void {
    this.phase = phase;
    this.panel.dataset.phase = phase;
    this.title.textContent = phase === 'note' ? 'Using Finger' : 'Choose how to steer';
    this.group.hidden = phase === 'note';
    this.group.setAttribute('aria-busy', String(phase === 'wait'));
    // A player who has answered before sees their current way marked (Shootout asks before every run).
    const settings = this.actions.get() as Settings | undefined;
    for (const choice of this.choices) {
      choice.setAttribute('aria-disabled', String(phase !== 'ask'));
      choice.classList.toggle('is-current', Boolean(settings?.steerOnboarded) && choice.dataset.steerChoice === settings?.touchMode);
    }
    this.start.hidden = phase !== 'note';
    this.help.textContent = phase === 'note' ? note : phase === 'wait' ? STEER_WAITING : STEER_LATER;
  }

  back(): void {
    if (this.phase !== 'wait') this.actions.back();
  }
}
