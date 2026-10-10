// Top-down car damage schematic: body zones (front / rear / left / right),
// wheels = suspension, the aero parts (Gen3: splitter + rear wing; Torana: air
// dam + tailgate spoiler), plus engine / suspension / aero system icons. The
// outline follows the player's car. Colours mix grey -> amber -> red in CSS.
import type { CarKind } from '@/car/car-specs';
import type { HudState } from '@/types/hud';
import { AttrSlot, h, s, TextSlot, VarSlot } from '@/hud/dom';
import { damageMix } from '@/hud/indicators';

type Damage = HudState['damage'];
type DamageKey = keyof Damage;

/** Below this every part counts as pristine and the graphic dims. */
const PRISTINE = 0.03;

interface Shape { body: string; glass: string; aero: Array<{ x: number; y: number; width: number; height: number }> }

export const DAMAGE_SHAPES: Record<'gen3' | 'classic', Shape> = {
  /** Gen3 body (nose up), 64 x 132 box: flared arches at y 30 / 94, tapered nose and tail; splitter and wing. */
  gen3: {
    body:
      'M32,7 C40,7 47,8 50.5,10.5 Q53,13 53.5,18 L54,22 Q54.8,30 54,38 L52.6,44 L52.6,84 L54,88 Q54.8,94 54,101 ' +
      'L53.6,112 Q53,118 49,120.5 C44,122 20,122 15,120.5 Q11,118 10.4,112 L10,101 Q9.2,94 10,88 L11.4,84 ' +
      'L11.4,44 L10,38 Q9.2,30 10,22 L10.5,18 Q11,13 13.5,10.5 C17,8 24,7 32,7 Z',
    glass: 'M17,45 H47 L43,55 H21 Z M21,76 H43 L46.5,85 H17.5 Z',
    aero: [{ x: 13, y: 4, width: 38, height: 3 }, { x: 9, y: 113, width: 46, height: 5 }],
  },
  /** 1979 Torana A9X to scale (4.51 x 1.80 m, axles at y 30 / 95): square nose and tail, bolt-on flares with
   *  square-cut ends, long bonnet, windscreen at the cowl, a long roof and a narrow raked rear glass; air dam and
   *  full-width tailgate spoiler. */
  classic: {
    body:
      'M15,7 H49 Q52,7 52.4,10 L53,16 L54.75,19 V41 L53,43 L53,82 L54.75,84 V106 L53,108 L52.6,118 Q52.4,121 49,121 ' +
      'H15 Q11.6,121 11.4,118 L11,108 L9.25,106 V84 L11,82 L11,43 L9.25,41 V19 L11,16 L11.6,10 Q12,7 15,7 Z',
    glass: 'M15,38 H49 L46,49 H18 Z M19,70 H45 L47.5,88 H16.5 Z',
    aero: [{ x: 12, y: 7, width: 40, height: 2.5 }, { x: 11, y: 116, width: 42, height: 4 }],
  },
};

const CLASSIC: ReadonlySet<CarKind> = new Set<CarKind>(['torana']);

/** Outline the schematic draws for a car (Gen3 when unknown). */
export function damageShapeFor(car: CarKind | undefined): keyof typeof DAMAGE_SHAPES {
  return car && CLASSIC.has(car) ? 'classic' : 'gen3';
}

interface Part {
  d1: VarSlot;
  d2: VarSlot;
}

function zone(key: DamageKey, attrs: Record<string, string | number>, tag: 'rect' | 'path' = 'rect'): SVGElement {
  return s(tag, { class: `hud-dmg hud-car__${key}`, 'data-k': key, ...attrs });
}

export class DamageView {
  readonly el: HTMLElement;
  private readonly parts = new Map<DamageKey, Part[]>();
  private readonly pristine: AttrSlot;
  private readonly pct = new Map<DamageKey, { text: TextSlot; ok: AttrSlot }>();
  private readonly outline: SVGElement[];
  private readonly glass: SVGElement;
  private readonly aero: SVGElement[];
  private shape: keyof typeof DAMAGE_SHAPES = 'gen3';

  constructor() {
    const zones = s('g', { 'clip-path': 'url(#hud-car-clip)' }, [
      s('rect', { class: 'hud-car__base', x: 0, y: 0, width: 64, height: 132 }),
      zone('front', { x: 0, y: 0, width: 64, height: 44 }),
      zone('rear', { x: 0, y: 85, width: 64, height: 47 }),
      zone('left', { x: 0, y: 44, width: 21, height: 41 }),
      zone('right', { x: 43, y: 44, width: 21, height: 41 }),
      s('rect', { class: 'hud-car__cabin', x: 21, y: 44, width: 22, height: 41 }),
    ]);
    const g = DAMAGE_SHAPES.gen3;
    const clip = s('path', { d: g.body });
    const outline = s('path', { class: 'hud-car__outline', d: g.body });
    this.outline = [clip, outline];
    this.glass = s('path', { class: 'hud-car__glass', d: g.glass });
    this.aero = g.aero.map((a) => zone('aero', { ...a, rx: 1 }));
    const svg = s('svg', { class: 'hud-car', viewBox: '0 0 64 132', 'aria-hidden': 'true' }, [
      s('defs', undefined, [s('clipPath', { id: 'hud-car-clip' }, [clip])]),
      zone('suspension', { x: 6, y: 22, width: 5.5, height: 16, rx: 1.6 }),
      zone('suspension', { x: 52.5, y: 22, width: 5.5, height: 16, rx: 1.6 }),
      zone('suspension', { x: 6, y: 86, width: 5.5, height: 16, rx: 1.6 }),
      zone('suspension', { x: 52.5, y: 86, width: 5.5, height: 16, rx: 1.6 }),
      zones,
      s('path', { class: 'hud-car__seams', d: 'M8,44 H56 M8,85 H56 M21,44 V85 M43,44 V85' }),
      this.glass,
      outline,
      ...this.aero,
    ]);
    const systems = h('div', 'hud-systems');
    for (const key of ['engine', 'suspension', 'aero'] as const) {
      // The value text is itself a damage part, so it takes the same amber / red mix as the car panels.
      const pct = h('span', 'hud-dmg hud-sys__pct', { 'data-k': key });
      const label = key === 'engine' ? 'ENG' : key === 'suspension' ? 'SUSP' : 'AERO';
      const row = h('div', 'hud-sys', { 'data-ok': 'true' }, [h('span', 'hud-telemetry__label', undefined, [label]), pct]);
      this.pct.set(key, { text: new TextSlot(pct), ok: new AttrSlot(row, 'data-ok') });
      systems.append(row);
    }
    this.el = h('div', 'hud-damage', { 'data-pristine': 'true' }, [svg, systems]);
    this.pristine = new AttrSlot(this.el, 'data-pristine');
    this.el.querySelectorAll<HTMLElement | SVGElement>('.hud-dmg').forEach((el) => {
      const key = el.getAttribute('data-k') as DamageKey;
      const list = this.parts.get(key) ?? [];
      list.push({ d1: new VarSlot(el, '--d1', 20), d2: new VarSlot(el, '--d2', 20) });
      this.parts.set(key, list);
    });
  }

  /** Switches the outline to the player's car (Gen3 shape when unknown). */
  private setCar(car: CarKind | undefined): void {
    const shape = damageShapeFor(car);
    if (shape === this.shape) return;
    this.shape = shape;
    const sh = DAMAGE_SHAPES[shape];
    for (const el of this.outline) el.setAttribute('d', sh.body);
    this.glass.setAttribute('d', sh.glass);
    this.aero.forEach((el, i) => {
      for (const [k, v] of Object.entries(sh.aero[i])) el.setAttribute(k, String(v));
    });
  }

  update(d: Damage, car?: CarKind): void {
    this.setCar(car);
    let worst = 0;
    for (const [key, list] of this.parts) {
      const level = d[key];
      worst = Math.max(worst, level);
      const m = damageMix(level);
      for (const p of list) {
        p.d1.set(m.d1);
        p.d2.set(m.d2);
      }
      const slot = this.pct.get(key);
      slot?.text.set(m.q > 0 ? `${Math.round(m.q * 100)}%` : 'OK');
      slot?.ok.set(m.q > 0 ? 'false' : 'true');
    }
    this.pristine.set(worst < PRISTINE ? 'true' : 'false');
  }
}
