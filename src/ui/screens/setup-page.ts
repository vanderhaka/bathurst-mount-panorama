import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { defaultSetup, getSetup, resetSetup, setSetup, setupRanges, stepSetup } from '@/config/setup';
import { h } from '@/hud/dom';
import { CAR_ORDER } from '@/ui/car-data';
import { menuButton, valueRow } from '@/ui/screen';
import { SETUP_FIELDS, setupText, type SetupField } from '@/ui/setup-model';

const CARS = CAR_ORDER;

export class SetupPage {
  readonly el: HTMLElement;
  readonly items: HTMLElement[];
  private car: CarKind = 'camaro';
  private readonly selector: ReturnType<typeof valueRow>;
  private readonly reset: HTMLButtonElement;
  private readonly rows: Array<{ field: SetupField; el: HTMLElement; value: HTMLElement }>;

  constructor(showHelp: (text: string) => void) {
    this.selector = valueRow('Car', (dir) => this.show(CARS[(CARS.indexOf(this.car) + dir + CARS.length) % CARS.length]), 'mn-value--setting');
    this.selector.el.addEventListener('focus', () => showHelp('Each car keeps its own saved setup. Choose the car you want to adjust.'));
    this.rows = SETUP_FIELDS.map((field) => {
      const row = valueRow(field.label, (dir) => {
        setSetup(this.car, stepSetup(this.car, getSetup(this.car), field.key, dir));
        this.render();
      }, 'mn-value--setting');
      row.el.addEventListener('focus', () => showHelp(field.help));
      return { field, ...row };
    });
    this.reset = menuButton('Reset this car', () => { resetSetup(this.car); this.render(); });
    this.reset.addEventListener('focus', () => showHelp('Restores this car’s default brake bias, anti-roll bars and tyre pressures.'));
    this.items = [this.selector.el, ...this.rows.map((row) => row.el), this.reset];
    this.el = h('div', 'mn-tabpage__rows', undefined, [
      h('p', 'mn-tabpage__note', undefined, ['Changes apply when driving. Each car keeps its own setup. Racing-line speeds follow the live car.']),
      ...this.items,
    ]);
    this.render();
  }

  show(car: CarKind): void { this.car = car; this.render(); }

  render(): void {
    const name = CAR_SPECS[this.car].shortName;
    this.selector.value.textContent = name;
    this.selector.el.dataset.value = this.car;
    this.selector.el.setAttribute('aria-label', `Car: ${name}. Left and right to change.`);
    this.reset.setAttribute('aria-label', `Reset ${name} setup to defaults`);
    const setup = getSetup(this.car), defaults = defaultSetup(this.car), ranges = setupRanges(this.car);
    for (const { field, el, value } of this.rows) {
      const v = setup[field.key], range = ranges[field.key];
      const on = Math.round((v - range.min) / (range.max - range.min) * 20);
      const mark = Math.round((defaults[field.key] - range.min) / (range.max - range.min) * 20) - 1;
      const text = setupText(field.key, v);
      value.replaceChildren(h('span', 'mn-value__text', undefined, [text]), h('span', 'mn-meter', { 'aria-hidden': 'true' }, Array.from({ length: 20 }, (_, i) => h('i', `${i < on ? 'is-on' : ''} ${i === mark ? 'is-default' : ''}`.trim()))));
      el.dataset.value = String(v);
      el.dataset.changed = String(v !== defaults[field.key]);
      el.setAttribute('aria-label', `${field.label}: ${text}. Left and right to change.`);
    }
  }
}
