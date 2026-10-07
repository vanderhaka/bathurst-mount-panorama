// Pause menu: resume, reset to track, restart, settings, controls, quit. Back resumes.
import { h, TextSlot } from '@/hud/dom';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS } from '@/ui/screen';

export interface PauseActions {
  resume(): void;
  /** Car back on the racing line at its current place, repaired. */
  resetCar(): void;
  restart(): void;
  settings(): void;
  controls(): void;
  quit(): void;
  /** One-line description of the running session, e.g. "Camaro ZL1 · #97 Heritage Red". */
  session(): string;
}

export class PauseScreen implements Screen {
  readonly id = 'pause' as const;
  readonly el = screenEl('pause', 'Paused', 'mn-screen--dim');
  private readonly buttons: HTMLButtonElement[];
  private readonly session = new TextSlot(h('p', 'mn-pause__session'));

  constructor(private readonly actions: PauseActions) {
    this.buttons = [
      menuButton('Resume', actions.resume, { variant: 'primary' }),
      menuButton('Reset to track', actions.resetCar, { aria: 'Reset to track: repairs the car and invalidates the lap' }),
      menuButton('Restart', actions.restart),
      menuButton('Settings', actions.settings),
      menuButton('Controls', actions.controls),
      menuButton('Quit to menu', actions.quit),
    ];
    this.el.append(
      h('div', 'mn-panel mn-panel--pause', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Session'), h('h2', 'mn-h2', undefined, ['Paused']), this.session.el]),
        h('nav', 'mn-list mn-list--compact', { 'aria-label': 'Pause menu' }, this.buttons),
      ]),
      hintBar(STD_HINTS),
    );
  }

  items(): HTMLElement[] {
    return this.buttons;
  }

  back(): void {
    this.actions.resume();
  }

  onShow(): void {
    this.session.set(this.actions.session());
  }
}
