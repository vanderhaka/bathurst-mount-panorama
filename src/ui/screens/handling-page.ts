// Settings > Handling: the handling values (config/handling.ts) as adjustable rows.
// A change applies to the car at once and is saved; the racing-line speeds follow
// at the next race start.
import { DEFAULT_HANDLING, getHandling, resetHandling, saveHandling, setHandling } from '@/config/handling';
import { h } from '@/hud/dom';
import { handlingFraction, handlingText, HANDLING_FIELDS, isDefaultHandling, stepHandling, type HandlingField } from '@/ui/handling-model';
import { menuButton, valueRow } from '@/ui/screen';

const METER_TICKS = 20;

function meter(fraction: number, defaultFraction: number): HTMLElement {
  const on = Math.round(fraction * METER_TICKS);
  const mark = Math.round(defaultFraction * METER_TICKS);
  return h('span', 'mn-meter', { 'aria-hidden': 'true' }, Array.from({ length: METER_TICKS }, (_, i) => h('i', `${i < on ? 'is-on' : ''} ${i === mark ? 'is-default' : ''}`.trim())));
}

export class HandlingPage {
  readonly el: HTMLElement;
  readonly items: HTMLElement[];
  private readonly rows: Array<{ field: HandlingField; el: HTMLElement; value: HTMLElement }>;

  constructor(showHelp: (text: string) => void) {
    this.rows = HANDLING_FIELDS.map((field) => {
      const r = valueRow(field.label, (d) => this.change(field, d), 'mn-value--setting mn-value--handling');
      r.el.addEventListener('focus', () => showHelp(field.help));
      return { field, ...r };
    });
    const reset = menuButton('Reset handling', () => {
      resetHandling();
      this.render();
    }, { aria: 'Reset handling to the measured car' });
    reset.addEventListener('focus', () => showHelp('Puts every handling value back to the measured car.'));
    this.items = [...this.rows.map((r) => r.el), reset];
    this.el = h('div', 'mn-tabpage__rows', undefined, [
      h('p', 'mn-tabpage__note', undefined, ['Changes apply to the car at once. The racing-line speeds update at the next race.']),
      ...this.items,
    ]);
  }

  private change(field: HandlingField, dir: -1 | 1): void {
    setHandling({ [field.key]: stepHandling(getHandling(), field, dir) });
    saveHandling();
    this.render();
  }

  render(): void {
    const hc = getHandling();
    for (const { field, el, value } of this.rows) {
      const v = hc[field.key];
      const text = handlingText(field, v);
      value.replaceChildren(h('span', 'mn-value__text', undefined, [text]), meter(handlingFraction(field, v), handlingFraction(field, DEFAULT_HANDLING[field.key])));
      el.dataset.changed = String(!isDefaultHandling(field, v));
      el.setAttribute('aria-label', `${field.label}: ${text}. Left and right to change.`);
    }
  }
}
