// One value row of the first race setup: the row itself, its help line and the small
// "Settings > ..." tag. Rows show a draft and report left / right steps; the screen owns the draft.
import { h } from '@/hud/dom';
import { fillPadText } from '@/input/pad-style';
import type { Settings } from '@/types/session';
import { type OnboardingRow, rowHelp, rowIndex, rowValue, rowValueLabel, rowWhere } from '@/ui/onboarding-model';
import { currentPadStyle, padText } from '@/ui/pad-glyphs';
import { valueRow } from '@/ui/screen';

export class RowView {
  readonly el: HTMLElement;
  /** The row with its help line and Settings tag. */
  readonly block: HTMLElement;
  private readonly value: HTMLElement;
  private readonly help = padText('p', 'mn-help mn-onb__help', '');

  constructor(readonly row: OnboardingRow, onStep: (row: OnboardingRow, dir: -1 | 1) => void) {
    const r = valueRow(row.label, (d) => onStep(row, d), 'mn-value--setting mn-value--choice');
    r.el.setAttribute('data-onboarding-row', row.key);
    this.el = r.el;
    this.value = r.value;
    const where = h('span', 'mn-onb__where', undefined, [rowWhere(row)]);
    this.block = h('div', 'mn-onb__row', undefined, [r.el, h('div', 'mn-onb__note', undefined, [this.help, where])]);
  }

  render(draft: Settings): void {
    const text = rowValueLabel(this.row, draft);
    const active = rowIndex(this.row, draft);
    this.value.replaceChildren(
      h('span', 'mn-value__text', undefined, [text]),
      h('span', 'mn-pips', { 'aria-hidden': 'true' }, this.row.options.map((_, i) => h('i', i === active ? 'is-on' : ''))),
    );
    this.el.dataset.value = String(rowValue(this.row, draft));
    this.el.setAttribute('aria-label', `${this.row.label}: ${text}. Left and right to change.`);
    const template = rowHelp(this.row, draft);
    this.help.dataset.padTemplate = template;
    this.help.textContent = fillPadText(template, currentPadStyle());
  }
}
