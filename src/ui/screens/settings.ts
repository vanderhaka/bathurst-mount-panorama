// Settings: every Settings field as an adjustable row, grouped, with live help text.
import { h } from '@/hud/dom';
import type { Settings } from '@/types/session';
import { fillPadText } from '@/input/pad-style';
import { currentPadStyle, padText } from '@/ui/pad-glyphs';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS, valueRow } from '@/ui/screen';
import { adjustSetting, optionIndex, SETTING_GROUPS, type SettingField, valueLabel } from '@/ui/settings-model';

interface Row {
  field: SettingField;
  el: HTMLElement;
  value: HTMLElement;
}

export interface SettingsActions {
  get(): Settings;
  set(s: Settings): void;
  back(): void;
}

function indicator(field: SettingField, settings: Settings): HTMLElement {
  if (field.kind === 'range') {
    const on = Math.round(settings.masterVolume * 20);
    return h('span', 'mn-meter', { 'aria-hidden': 'true' }, Array.from({ length: 20 }, (_, i) => h('i', i < on ? 'is-on' : '')));
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

  constructor(private readonly actions: SettingsActions) {
    const groups = SETTING_GROUPS.map((g) => {
      const rows = g.fields.map((field) => {
        const r = valueRow(field.label, (d) => this.change(field, d), `mn-value--setting mn-value--${field.kind}`);
        r.el.addEventListener('focus', () => this.showHelp(field.help));
        const row = { field, ...r };
        this.rows.push(row);
        return r.el;
      });
      return h('section', 'mn-group', { 'aria-label': g.title }, [h('h3', 'mn-group__title', undefined, [g.title]), ...rows]);
    });
    this.done = menuButton('Done', () => actions.back(), { variant: 'primary' });
    this.done.addEventListener('focus', () => this.showHelp('Settings apply immediately.'));
    this.el.append(
      h('div', 'mn-panel mn-panel--settings', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Options'), h('h2', 'mn-h2', undefined, ['Settings'])]),
        h('div', 'mn-settings__cols', undefined, groups),
        h('footer', 'mn-panel__foot', undefined, [this.help, this.done]),
      ]),
      hintBar([['←→', 'DPAD', 'Change'], ...STD_HINTS]),
    );
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
  }

  items(): HTMLElement[] {
    return [...this.rows.map((r) => r.el), this.done];
  }

  back(): void {
    this.actions.back();
  }

  onShow(): void {
    this.render();
    this.showHelp(this.rows[0]?.field.help ?? '');
  }

  private showHelp(template: string): void {
    this.help.dataset.padTemplate = template;
    this.help.textContent = fillPadText(template, currentPadStyle());
  }
}
