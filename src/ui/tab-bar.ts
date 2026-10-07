// Tab strip for a menu panel. LB / RB (L1 / R1) or Q / E change the tab (MenuNav
// 'prevTab' / 'nextTab'); a click selects a tab directly. The tabs are not focus
// stops, so up / down / left / right keep moving through the page's rows.
import { h } from '@/hud/dom';
import { padChip } from '@/ui/pad-glyphs';

export class TabBar {
  readonly el: HTMLElement;
  private readonly tabs: HTMLButtonElement[];

  constructor(labels: string[], label: string, onSelect: (index: number) => void) {
    this.tabs = labels.map((text, i) => {
      const tab = h('button', 'mn-tab', { type: 'button', role: 'tab', tabindex: -1 }, [text]);
      tab.addEventListener('click', () => onSelect(i));
      return tab;
    });
    const end = (key: string, pad: string, first: boolean) =>
      h('span', 'mn-tabs__key', { 'aria-hidden': 'true' }, first ? [h('kbd', 'mn-key mn-key--sm', undefined, [key]), padChip(pad)] : [padChip(pad), h('kbd', 'mn-key mn-key--sm', undefined, [key])]);
    this.el = h('nav', 'mn-tabs', { role: 'tablist', 'aria-label': label }, [end('Q', 'LB', true), ...this.tabs, end('E', 'RB', false)]);
  }

  get count(): number {
    return this.tabs.length;
  }

  select(index: number): void {
    this.tabs.forEach((t, i) => {
      t.classList.toggle('is-active', i === index);
      t.setAttribute('aria-selected', String(i === index));
    });
  }
}
