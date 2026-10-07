// Car select: car and livery pickers over the live 3D preview, spec sheet, RACE.
import type { CarKind } from '@/car/car-specs';
import type { TyreCompound } from '@/physics/tyre-state';
import { LIVERY_PRESETS } from '@/car/liveries';
import { h } from '@/hud/dom';
import { CAR_ORDER, carSheet, hexColour, LIVERY_COUNT } from '@/ui/car-data';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS, valueRow } from '@/ui/screen';

export interface CarSelectActions {
  preview(car: CarKind, livery: number): void;
  start(car: CarKind, livery: number, tyres: TyreCompound): void;
  back(): void;
}

const PATTERN_LABEL: Record<string, string> = { stripes: 'Twin stripes', split: 'Split', chevron: 'Chevron', arrow: 'Arrow' };

function dots(count: number, active: number): HTMLElement {
  return h(
    'span',
    'mn-dots',
    { 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) => h('i', i === active ? 'is-on' : '')),
  );
}

export class CarSelectScreen implements Screen {
  readonly id = 'car' as const;
  readonly el = screenEl('car', 'Car select', 'mn-screen--side');
  private carIdx = 0;
  private livery = 0;
  private tyres: TyreCompound = 'soft';
  private readonly carRow;
  private readonly liveryRow;
  private readonly tyreRow;
  private readonly specs = h('dl', 'mn-specs');
  private readonly note = h('p', 'mn-specs__note');
  private readonly race: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;

  constructor(private readonly actions: CarSelectActions) {
    this.carRow = valueRow('Car', (d) => this.step('car', d), 'mn-value--car');
    this.liveryRow = valueRow('Livery', (d) => this.step('livery', d), 'mn-value--livery');
    this.tyreRow = valueRow('Tyres', () => { this.tyres = this.tyres === 'soft' ? 'hard' : 'soft'; this.renderTyres(); });
    this.race = menuButton('Start time trial', () => actions.start(this.car, this.livery, this.tyres), { variant: 'primary', aria: 'Start time trial' });
    this.backBtn = menuButton('Back', () => actions.back());
    this.el.append(
      h('div', 'mn-side mn-side--car', undefined, [
        kicker('Select car · Gen3 Supercar'),
        this.carRow.el,
        h('div', 'mn-specs-wrap', undefined, [this.specs, this.note]),
        this.liveryRow.el,
        this.tyreRow.el,
        h('div', 'mn-actions', undefined, [this.race, this.backBtn]),
      ]),
      hintBar([['←→', 'DPAD', 'Change'], ...STD_HINTS.slice(0, 1), ['Enter', 'A', 'Confirm'], ['Esc', 'B', 'Back']]),
    );
    this.render();
    this.renderTyres();
  }

  get car(): CarKind {
    return CAR_ORDER[this.carIdx];
  }

  private step(what: 'car' | 'livery', dir: -1 | 1): void {
    if (what === 'car') this.carIdx = (this.carIdx + dir + CAR_ORDER.length) % CAR_ORDER.length;
    else this.livery = (this.livery + dir + LIVERY_COUNT) % LIVERY_COUNT;
    this.render();
    this.actions.preview(this.car, this.livery);
  }

  private render(): void {
    const sheet = carSheet(this.car);
    this.carRow.value.replaceChildren(
      h('span', 'mn-car__maker', undefined, [sheet.maker]),
      h('span', 'mn-car__name', undefined, [sheet.name]),
      dots(CAR_ORDER.length, this.carIdx),
    );
    this.carRow.el.setAttribute('aria-label', `Car: ${sheet.name}. Left and right to change.`);
    this.specs.replaceChildren(...sheet.rows.map(([k, v]) => h('div', 'mn-spec', undefined, [h('dt', undefined, undefined, [k]), h('dd', undefined, undefined, [v])])));
    this.note.textContent = sheet.note;
    const preset = LIVERY_PRESETS[this.car][this.livery];
    const l = preset.livery;
    this.liveryRow.value.replaceChildren(
      h('span', 'mn-swatches', { 'aria-hidden': 'true' }, [l.primary, l.secondary, l.accent].map((c) => h('i', undefined, { style: `background:${hexColour(c)}` }))),
      h('span', 'mn-livery__text', undefined, [
        h('span', 'mn-livery__name', undefined, [preset.name]),
        h('span', 'mn-livery__meta', undefined, [`#${l.number} · ${PATTERN_LABEL[l.pattern] ?? l.pattern}`]),
      ]),
      dots(LIVERY_COUNT, this.livery),
    );
    this.liveryRow.el.setAttribute('aria-label', `Livery: ${preset.name}, number ${l.number}. Left and right to change.`);
  }

  private renderTyres(): void {
    const label = this.tyres === 'soft' ? 'Soft' : 'Hard';
    this.tyreRow.value.textContent = label;
    this.tyreRow.el.setAttribute('aria-label', `Tyres: ${label}. Left and right to change for the next session.`);
  }

  items(): HTMLElement[] {
    return [this.carRow.el, this.liveryRow.el, this.tyreRow.el, this.race, this.backBtn];
  }

  back(): void {
    this.actions.back();
  }

  onShow(): void {
    this.actions.preview(this.car, this.livery);
  }
}
