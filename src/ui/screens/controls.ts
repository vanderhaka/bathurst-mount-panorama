// Controls help: keyboard rows with keycaps and the gamepad diagram, both from BINDINGS.
import { h } from '@/hud/dom';
import { keyboardRows } from '@/ui/controls-data';
import type { PadStyle } from '@/input/pad-style';
import { gamepadDiagram } from '@/ui/gamepad-diagram';
import { padText } from '@/ui/pad-glyphs';
import { hintBar, kicker, menuButton, type Screen, screenEl } from '@/ui/screen';

export class ControlsScreen implements Screen {
  readonly id = 'controls' as const;
  readonly el = screenEl('controls', 'Controls', 'mn-screen--dim');
  private readonly done: HTMLButtonElement;
  private diagram: HTMLElement = gamepadDiagram('xbox');

  constructor(private readonly onBack: () => void) {
    this.done = menuButton('Back', onBack, { variant: 'primary' });
    const keys = h(
      'dl',
      'mn-keys',
      undefined,
      keyboardRows().map((r) =>
        h('div', 'mn-keys__row', undefined, [
          h('dt', undefined, undefined, [r.label]),
          h(
            'dd',
            undefined,
            undefined,
            r.keys.flatMap((group, i) => [
              i > 0 ? h('span', 'mn-keys__or', undefined, ['or']) : null,
              ...group.map((k) => h('kbd', `mn-key ${k.length > 2 ? 'mn-key--wide' : ''}`, undefined, [k])),
            ]),
          ),
        ]),
      ),
    );
    this.el.append(
      h('div', 'mn-panel mn-panel--controls', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Help'), h('h2', 'mn-h2', undefined, ['Controls'])]),
        h('div', 'mn-controls__cols', undefined, [
          h('section', 'mn-controls__col', { 'aria-label': 'Keyboard' }, [h('h3', 'mn-group__title', undefined, ['Keyboard']), keys]),
          h('section', 'mn-controls__col', { 'aria-label': 'Gamepad' }, [h('h3', 'mn-group__title', undefined, ['Gamepad']), this.diagram]),
        ]),
        h('footer', 'mn-panel__foot', undefined, [padText('p', 'mn-help', 'Menus: arrow keys or D-pad to move, Enter or {A} to confirm, Esc or {B} to go back.'), this.done]),
      ]),
      hintBar([['Esc', 'B', 'Back']]),
    );
  }

  /** Redraws the controller diagram for a controller family (PlayStation has its own layout). */
  setPadStyle(style: PadStyle): void {
    const next = gamepadDiagram(style);
    this.diagram.replaceWith(next);
    this.diagram = next;
  }

  items(): HTMLElement[] {
    return [this.done];
  }

  back(): void {
    this.onBack();
  }
}
