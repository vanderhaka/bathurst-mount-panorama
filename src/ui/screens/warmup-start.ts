// Shootout warm-up question: asked after car select before every Shootout run. Grid or a rolling start
// just after Forrest's Elbow; the last answer is marked and focused, so Enter / A repeats it.
import '@/ui/steer.css';
import { h } from '@/hud/dom';
import { loadWarmupStart, saveWarmupStart, type WarmupStart } from '@/shootout/warmup-start';
import type { ShootoutMode } from '@/types/session';
import { hintBar, kicker, menuButton, type Screen, screenEl } from '@/ui/screen';

const CHOICES: readonly { start: WarmupStart; label: string; help: string }[] = [
  { start: 'grid', label: 'Grid', help: 'Pole position, the start lights, then one full warm-up lap.' },
  { start: 'rolling', label: "After Forrest's Elbow", help: 'A 3, 2, 1 countdown, then rolling down Conrod Straight on warm tyres. Shorter.' },
];

export class WarmupStartScreen implements Screen {
  readonly id = 'warmup' as const;
  readonly el = screenEl('warmup', 'Choose where the warm-up starts', 'mn-screen--dim');
  private readonly choices: HTMLButtonElement[];
  private readonly help = h('p', 'mn-help');
  private mode: ShootoutMode = 'shootoutArcade';
  private proceed: () => void = () => {};

  constructor(private readonly onBack: () => void) {
    this.choices = CHOICES.map(({ start, label, help }) => {
      const btn = menuButton(label, () => this.choose(start));
      btn.classList.add('mn-steer__choice');
      btn.setAttribute('data-warmup-start', start);
      btn.append(h('span', 'mn-steer__help', undefined, [help]));
      return btn;
    });
    this.el.append(
      h('div', 'mn-panel mn-panel--steer', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Shootout warm-up'), h('h2', 'mn-h2', undefined, ['Where do you start?'])]),
        h('div', 'mn-steer__choices', { role: 'group', 'aria-label': 'Warm-up start' }, this.choices),
        h('footer', 'mn-panel__foot', undefined, [this.help]),
      ]),
      hintBar([['←→', 'DPAD', 'Choose'], ['Enter', 'A', 'Confirm'], ['Esc', 'B', 'Back']]),
    );
  }

  /** Call before showing the screen. `proceed` runs once the choice is saved. */
  ask(mode: ShootoutMode, proceed: () => void): void {
    this.mode = mode;
    this.proceed = proceed;
    const current = loadWarmupStart(mode);
    for (const choice of this.choices) choice.classList.toggle('is-current', choice.dataset.warmupStart === current);
    this.help.textContent = mode === 'shootoutTop10'
      ? 'Either way, your attempt starts when you cross the line. Quitting before then uses no attempt.'
      : 'Either way, your timed lap starts when you cross the line.';
  }

  /** The button for the remembered start, focused first. */
  current(): HTMLButtonElement {
    return this.choices.find(c => c.classList.contains('is-current')) ?? this.choices[0];
  }

  items(): HTMLElement[] { return this.choices; }

  private choose(start: WarmupStart): void {
    saveWarmupStart(this.mode, start);
    this.proceed();
  }

  back(): void { this.onBack(); }
}
