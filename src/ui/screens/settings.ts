// Settings: tabs (Driving assists, Display, Graphics and audio, and in dev builds
// Handling) of adjustable rows with live help text. LB / RB (L1 / R1) or Q / E change
// the tab. Dev builds also get the "Graphics tuner" button.
import { DEV_TOOLS } from '@/config/build-flags';
import { h } from '@/hud/dom';
import { DEFAULT_SETTINGS, type Settings } from '@/types/session';
import { fillPadText } from '@/input/pad-style';
import { currentPadStyle, padText } from '@/ui/pad-glyphs';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS, valueRow } from '@/ui/screen';
import { HandlingPage } from '@/ui/screens/handling-page';
import { adjustSetting, optionIndex, rangeFraction, SETTING_GROUPS, type SettingField, valueLabel } from '@/ui/settings-model';
import { TabBar } from '@/ui/tab-bar';

interface Row {
  field: SettingField;
  el: HTMLElement;
  value: HTMLElement;
}

interface Page {
  el: HTMLElement;
  items: HTMLElement[];
}

export interface SettingsActions {
  get(): Settings;
  set(s: Settings): void;
  back(): void;
  /** Opens or closes the live graphics tuner. */
  toggleTuner(): void;
}

function indicator(field: SettingField, settings: Settings): HTMLElement {
  if (field.kind === 'range') {
    // 20 ticks; the taller tick marks the default value.
    const on = Math.round(rangeFraction(field, settings[field.key]) * 20);
    const mark = Math.round(rangeFraction(field, DEFAULT_SETTINGS[field.key]) * 20) - 1;
    return h('span', 'mn-meter', { 'aria-hidden': 'true' }, Array.from({ length: 20 }, (_, i) => h('i', `${i < on ? 'is-on' : ''} ${i === mark ? 'is-default' : ''}`.trim())));
  }
  const active = optionIndex(field, settings);
  return h(
    'span',
    'mn-pips',
    { 'aria-hidden': 'true' },
    field.options.map((_, i) => h('i', i === active ? 'is-on' : '')),
  );
}

export class SettingsScreen implements Screen {
  readonly id = 'settings' as const;
  readonly el = screenEl('settings', 'Settings', 'mn-screen--dim');
  private readonly rows: Row[] = [];
  /** Help line; its template stays on the element so a controller change relabels it. */
  private readonly help = padText('p', 'mn-help', '');
  private readonly done: HTMLButtonElement;
  private readonly handling = DEV_TOOLS ? new HandlingPage((text) => this.showHelp(text)) : null;
  private readonly pages: Page[];
  private readonly tabs: TabBar;
  private tabIndex = 0;

  constructor(private readonly actions: SettingsActions) {
    this.pages = SETTING_GROUPS.map((g) => {
      const items = g.fields.map((field) => this.row(field));
      return { el: h('div', 'mn-tabpage__rows', undefined, items), items };
    });
    if (this.handling) this.addDevTools(this.handling);
    this.tabs = new TabBar([...SETTING_GROUPS.map((g) => g.title), ...(this.handling ? ['Handling'] : [])], 'Settings sections', (i) => {
      this.selectTab(i);
      this.items()[0]?.focus({ preventScroll: true });
    });
    this.done = menuButton('Done', () => actions.back(), { variant: 'primary' });
    this.done.addEventListener('focus', () => this.showHelp('Settings apply immediately.'));
    this.el.append(
      h('div', 'mn-panel mn-panel--settings', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Options'), h('h2', 'mn-h2', undefined, ['Settings'])]),
        this.tabs.el,
        h('div', 'mn-tabpage', { role: 'tabpanel' }, this.pages.map((p) => p.el)),
        h('footer', 'mn-panel__foot', undefined, [this.help, this.done]),
      ]),
      hintBar([['Q E', 'LB RB', 'Tab'], ['←→', 'DPAD', 'Change'], ...STD_HINTS]),
    );
    this.selectTab(0);
  }

  /** Dev builds: the graphics tuner button and the Handling tab. */
  private addDevTools(handling: HandlingPage): void {
    const tuner = menuButton('Graphics tuner', () => this.actions.toggleTuner(), { aria: 'Open or close the graphics tuner' });
    tuner.addEventListener('focus', () => this.showHelp('Opens or closes the live graphics tuner at the right of the screen. Use the mouse. T also opens and closes it.'));
    const graphics = this.pages[SETTING_GROUPS.findIndex((g) => g.title === 'Graphics and audio')];
    graphics.el.append(tuner);
    graphics.items.push(tuner);
    this.pages.push(handling);
  }

  private row(field: SettingField): HTMLElement {
    const r = valueRow(field.label, (d) => this.change(field, d), `mn-value--setting mn-value--${field.kind}`);
    r.el.addEventListener('focus', () => this.showHelp(field.help));
    this.rows.push({ field, ...r });
    return r.el;
  }

  private selectTab(index: number): void {
    this.tabIndex = index;
    this.tabs.select(index);
    this.pages.forEach((p, i) => (p.el.hidden = i !== index));
  }

  tab(dir: -1 | 1): void {
    this.selectTab((this.tabIndex + dir + this.pages.length) % this.pages.length);
  }

  private change(field: SettingField, dir: -1 | 1): void {
    const next = adjustSetting(this.actions.get(), field, dir);
    this.actions.set(next);
    this.render();
  }

  private render(): void {
    const settings = this.actions.get();
    for (const r of this.rows) {
      const text = valueLabel(r.field, settings);
      r.value.replaceChildren(h('span', 'mn-value__text', undefined, [text]), indicator(r.field, settings));
      r.el.dataset.value = String(settings[r.field.key]);
      r.el.setAttribute('aria-label', `${r.field.label}: ${text}. Left and right to change.`);
    }
    this.handling?.render();
  }

  items(): HTMLElement[] {
    return [...this.pages[this.tabIndex].items, this.done];
  }

  back(): void {
    this.actions.back();
  }

  onShow(): void {
    this.render();
  }

  private showHelp(template: string): void {
    this.help.dataset.padTemplate = template;
    this.help.textContent = fillPadText(template, currentPadStyle());
  }
}
