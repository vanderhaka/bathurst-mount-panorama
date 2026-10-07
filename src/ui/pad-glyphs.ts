// Gamepad prompts that follow the connected controller (Xbox names or PlayStation
// symbols). Chips carry their standard control name in data-pad, help texts their
// template in data-pad-template, and applyPadStyle() relabels them all when the
// controller family changes.
import { h, s } from '@/hud/dom';
import { fillPadText, padName, type PadStyle } from '@/input/pad-style';

let current: PadStyle = 'xbox';

/**
 * PlayStation face symbols as stroked paths in a -8..8 box. They are drawn, not typed,
 * because the menu fonts have no ○ / □ and the fallback fonts draw them too small.
 */
const PS_FACE: Record<string, { d: string; name: string }> = {
  A: { d: 'M-4.6,-4.6 L4.6,4.6 M4.6,-4.6 L-4.6,4.6', name: 'Cross' },
  B: { d: 'M5.2,0 A5.2,5.2 0 1,1 -5.2,0 A5.2,5.2 0 1,1 5.2,0 Z', name: 'Circle' },
  X: { d: 'M-4.6,-4.6 H4.6 V4.6 H-4.6 Z', name: 'Square' },
  Y: { d: 'M0,-6 L5.6,3.6 H-5.6 Z', name: 'Triangle' },
};

/** Path data of a PlayStation face symbol, or undefined for other controls / Xbox. */
export function psFacePath(label: string, style: PadStyle): string | undefined {
  return style === 'xbox' ? undefined : PS_FACE[label]?.d;
}

/** The controller family the menus show now. */
export function currentPadStyle(): PadStyle {
  return current;
}

function chipContent(label: string, style: PadStyle): Node | string {
  const d = psFacePath(label, style);
  if (!d) return padName(label, style);
  return s('svg', { class: 'mn-pad__sym', viewBox: '-8 -8 16 16', role: 'img', 'aria-label': PS_FACE[label].name }, [s('path', { d })]);
}

/** Inline chip for a control (standard name, e.g. "A", "LT", "DPAD"). */
export function padChip(label: string, title = label): HTMLElement {
  return h('span', `mn-pad mn-pad--${label.toLowerCase()}`, { title, 'data-pad': label }, [chipContent(label, current)]);
}

/** Help text with "{A}"-style placeholders that follows the controller family. */
export function padText(tag: 'p' | 'span', cls: string, template: string): HTMLElement {
  return h(tag, cls, { 'data-pad-template': template }, [fillPadText(template, current)]);
}

/** Relabels every chip and help text under `root` for a controller family. */
export function applyPadStyle(root: HTMLElement, style: PadStyle): void {
  current = style;
  root.dataset.pad = style;
  for (const el of root.querySelectorAll<HTMLElement>('[data-pad]')) {
    const label = el.dataset.pad;
    if (label) el.replaceChildren(chipContent(label, style));
  }
  for (const el of root.querySelectorAll<HTMLElement>('[data-pad-template]')) {
    el.textContent = fillPadText(el.dataset.padTemplate ?? '', style);
  }
}
