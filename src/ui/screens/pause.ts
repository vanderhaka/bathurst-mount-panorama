// Pause menu: resume, reset to track, restart, settings, controls, quit. Back resumes.
import { h, TextSlot } from '@/hud/dom';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS } from '@/ui/screen';
import type { ShootoutMode } from '@/types/session';

export interface PauseActions {
  resume(): void;
  /** Car back on the racing line at its current place, repaired. */
  resetCar(): void;
  restart(): void;
  settings(): void;
  controls(): void;
  results(): void;
  telemetry(): void;
  quit(): void;
  /** One-line description of the running session, e.g. "Camaro ZL1 · #97 Heritage Red". */
  session(): string;
}

const RESET_ARIA = 'Reset to track: repairs the car and invalidates the lap';
/** Time (ms) for the second press that ends a Top 10 attempt. */
export const CONFIRM_MS = 3000;

export class PauseScreen implements Screen {
  readonly id = 'pause' as const;
  readonly el = screenEl('pause', 'Paused', 'mn-screen--dim');
  private readonly buttons: HTMLButtonElement[];
  private readonly session = new TextSlot(h('p', 'mn-pause__session'));
  private readonly warning = h('p', 'mn-shootout-fine', { hidden: true });
  private shootout: { mode: ShootoutMode; timed: boolean } | undefined;
  /** Top 10 timed lap: Restart ends the attempt, so it asks for a second press within CONFIRM_MS. */
  private confirmEnd = false;
  private armedAt: number | null = null;
  private disarm: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly actions: PauseActions) {
    this.buttons = [
      menuButton('Resume', actions.resume, { variant: 'primary' }),
      menuButton('Reset to track', actions.resetCar, { aria: RESET_ARIA }),
      menuButton('Restart', () => this.restart()),
      menuButton('Settings', actions.settings),
      menuButton('Controls', actions.controls),
      menuButton('Results', actions.results),
      menuButton('Telemetry', actions.telemetry),
      menuButton('Quit to menu', actions.quit),
    ];
    this.el.append(
      h('div', 'mn-panel mn-panel--pause', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Session'), h('h2', 'mn-h2', undefined, ['Paused']), this.session.el, this.warning]),
        h('nav', 'mn-list mn-list--compact', { 'aria-label': 'Pause menu' }, this.buttons),
      ]),
      hintBar(STD_HINTS),
    );
  }

  items(): HTMLElement[] {
    return this.buttons.filter(b => !b.hidden && !b.disabled);
  }

  setShootout(shootout?: { mode: ShootoutMode; timed: boolean }): void {
    this.shootout = shootout;
    const competition = shootout?.mode === 'shootoutTop10';
    const timed = Boolean(shootout?.timed);
    this.warning.hidden = !shootout;
    this.warning.textContent = competition
      ? timed ? 'Your timed lap has started. Ending it or quitting keeps this attempt used.' : 'Warm-up is free. Restarting or quitting now uses no competition attempt.'
      : 'Arcade practice. No official score and no competition attempt used.';
    this.buttons[5].hidden = Boolean(shootout);
    this.buttons[6].hidden = Boolean(shootout);
    // A reset ends a timed lap, so the timed lap only offers the deliberate End button; in the warm-up it restarts it.
    this.buttons[1].hidden = timed;
    this.label(this.buttons[1], shootout ? 'Back to the start' : 'Reset to track',
      shootout ? 'Back to the start: restarts the warm-up before Forrest’s Elbow. No attempt is used.' : RESET_ARIA);
    this.confirmEnd = competition && timed;
    this.armedAt = null;
    this.clearDisarm();
    this.restartLabel();
  }

  private label(button: HTMLButtonElement, text: string, aria = text): void {
    const el = button.querySelector('.mn-btn__label');
    if (el) el.textContent = text;
    button.setAttribute('aria-label', aria);
  }

  private restartLabel(): void {
    if (this.confirmEnd) {
      const armed = this.armedAt !== null;
      this.label(this.buttons[2], armed ? 'Press again to end' : 'End this attempt',
        armed ? 'Press again to end this attempt. It stays used.' : 'End this attempt: press twice. The attempt stays used.');
    } else this.label(this.buttons[2], !this.shootout ? 'Restart' : this.shootout.timed ? 'End this lap' : 'Restart warm-up');
  }

  private restart(): void {
    if (!this.confirmEnd) { this.actions.restart(); return; }
    const now = performance.now();
    if (this.armedAt !== null && now - this.armedAt <= CONFIRM_MS) {
      this.armedAt = null;
      this.clearDisarm();
      this.restartLabel();
      this.actions.restart();
      return;
    }
    this.armedAt = now;
    this.restartLabel();
    this.clearDisarm();
    this.disarm = setTimeout(() => { this.armedAt = null; this.disarm = null; this.restartLabel(); }, CONFIRM_MS);
  }

  private clearDisarm(): void {
    if (this.disarm) clearTimeout(this.disarm);
    this.disarm = null;
  }

  onHide(): void {
    this.armedAt = null;
    this.clearDisarm();
    this.restartLabel();
  }

  back(): void {
    this.actions.resume();
  }

  onShow(): void {
    this.session.set(this.actions.session());
  }
}
