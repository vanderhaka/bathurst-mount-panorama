// Shared menu building blocks: screen contract, adjustable rows, buttons, hint bar.
import { h } from '@/hud/dom';
import { padChip } from '@/ui/pad-glyphs';

export type ScreenId = 'loading' | 'title' | 'car' | 'settings' | 'pause' | 'controls' | 'results';

export interface Screen {
  readonly id: ScreenId;
  readonly el: HTMLElement;
  /** Focusable items in navigation order (top to bottom). */
  items(): HTMLElement[];
  /** Escape / B / Backspace. */
  back(): void;
  onShow?(): void;
  /** LB / RB or Q / E: previous / next tab (screens with tabs). */
  tab?(dir: -1 | 1): void;
}

/** Left/right handlers for value rows (settings, car, livery). */
const adjusters = new WeakMap<HTMLElement, (dir: -1 | 1) => void>();

export function setAdjust(el: HTMLElement, fn: (dir: -1 | 1) => void): void {
  adjusters.set(el, fn);
}

export function adjust(el: HTMLElement, dir: -1 | 1): boolean {
  const fn = adjusters.get(el);
  if (!fn) return false;
  fn(dir);
  return true;
}

export function screenEl(id: ScreenId, label: string, extra = ''): HTMLElement {
  return h('section', `mn-screen mn-screen--${id} ${extra}`.trim(), { role: 'dialog', 'aria-modal': 'true', 'aria-label': label, hidden: true });
}

export function menuButton(label: string, onClick: () => void, opts: { index?: string; variant?: 'primary' | 'plain'; aria?: string } = {}): HTMLButtonElement {
  const btn = h('button', `mn-item mn-btn mn-btn--${opts.variant ?? 'plain'}`, { type: 'button', 'aria-label': opts.aria }, [
    opts.index ? h('span', 'mn-btn__idx', { 'aria-hidden': 'true' }, [opts.index]) : null,
    h('span', 'mn-btn__label', undefined, [label]),
  ]);
  btn.addEventListener('click', onClick);
  return btn;
}

/** Small arrow button inside an adjustable row (mouse only; keyboard uses left/right). */
export function arrowButton(dir: -1 | 1, label: string, onClick: () => void): HTMLButtonElement {
  const btn = h('button', `mn-arrow mn-arrow--${dir < 0 ? 'prev' : 'next'}`, { type: 'button', tabindex: -1, 'aria-label': label }, [
    dir < 0 ? '‹' : '›',
  ]);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

export function kicker(text: string): HTMLElement {
  return h('p', 'mn-kicker', undefined, [h('i', 'mn-kicker__bar', { 'aria-hidden': 'true' }), text]);
}

/** Bottom hint bar: keyboard and gamepad glyphs for the current screen. `pad` may hold several controls ("LB RB"). */
export function hintBar(hints: Array<[key: string, pad: string, label: string]>): HTMLElement {
  return h(
    'footer',
    'mn-hints',
    { 'aria-hidden': 'true' },
    hints.map(([key, pad, label]) =>
      h('span', 'mn-hint', undefined, [h('kbd', 'mn-key mn-key--sm', undefined, [key]), ...pad.split(' ').map((p) => padChip(p)), label]),
    ),
  );
}

/**
 * The item beside `from` in direction `dir` (-1 = left, 1 = right): the nearest item
 * whose centre is to that side and that overlaps `from` vertically. Null when none.
 */
export function itemBeside(items: HTMLElement[], from: HTMLElement, dir: -1 | 1): HTMLElement | null {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const dx = (b.left + b.width / 2 - ax) * dir;
    const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (dx <= 1 || overlap <= 0) continue;
    if (dx < bestScore) {
      bestScore = dx;
      best = el;
    }
  }
  return best;
}

export const STD_HINTS: Array<[string, string, string]> = [
  ['↑↓', 'DPAD', 'Select'],
  ['Enter', 'A', 'Confirm'],
  ['Esc', 'B', 'Back'],
];

/**
 * Focusable row whose value changes with left / right (or the arrow buttons,
 * or a click / Enter which steps forward).
 */
export function valueRow(label: string, onAdjust: (dir: -1 | 1) => void, cls = ''): { el: HTMLElement; value: HTMLElement } {
  const value = h('span', 'mn-value__v');
  const el = h('div', `mn-item mn-value ${cls}`.trim(), { tabindex: 0, role: 'group', 'aria-label': label }, [
    h('span', 'mn-value__label', undefined, [label]),
    h('span', 'mn-value__ctl', undefined, [arrowButton(-1, `Previous ${label.toLowerCase()}`, () => onAdjust(-1)), value, arrowButton(1, `Next ${label.toLowerCase()}`, () => onAdjust(1))]),
  ]);
  setAdjust(el, onAdjust);
  el.addEventListener('click', () => onAdjust(1));
  return { el, value };
}
