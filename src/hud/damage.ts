// Top-down Gen3 car damage schematic: body zones (front / rear / left / right),
// wheels = suspension, splitter + rear wing = aero, plus engine / suspension /
// aero system icons. Colours mix green -> amber -> red in CSS (theme vars).
import type { HudState } from '@/types/hud';
import { AttrSlot, h, s, TextSlot, VarSlot } from '@/hud/dom';
import { damageMix } from '@/hud/indicators';

type Damage = HudState['damage'];
type DamageKey = keyof Damage;

/** Below this every part counts as pristine and the graphic dims. */
const PRISTINE = 0.03;

/** Top-down Gen3 body (nose up), 64 x 132 box: flared arches at y 30 / 94, tapered nose and tail. */
const BODY =
  'M32,7 C40,7 47,8 50.5,10.5 Q53,13 53.5,18 L54,22 Q54.8,30 54,38 L52.6,44 L52.6,84 L54,88 Q54.8,94 54,101 ' +
  'L53.6,112 Q53,118 49,120.5 C44,122 20,122 15,120.5 Q11,118 10.4,112 L10,101 Q9.2,94 10,88 L11.4,84 ' +
  'L11.4,44 L10,38 Q9.2,30 10,22 L10.5,18 Q11,13 13.5,10.5 C17,8 24,7 32,7 Z';

const GLASS = 'M17,45 H47 L43,55 H21 Z M21,76 H43 L46.5,85 H17.5 Z';

const ICONS: Record<'engine' | 'suspension' | 'aero', string> = {
  engine: 'M3,10 H5 V8 H8 V6 H6 V4.5 H13 V6 H11 V8 H15 L17,10 H19 V8.5 H21 V16 H19 V14.5 H17 V17 L15,19 H8 L6,17 H5 V15 H3 Z',
  suspension: 'M6,3 h12 M12,3 v2 M7,6 l10,2.5 l-10,2.5 l10,2.5 l-10,2.5 l10,2.5 M12,19 v2 M6,21 h12',
  aero: 'M2,6.5 h2.4 v10 H2 Z M19.6,6.5 H22 v10 h-2.4 Z M4.4,8.5 H19.6 V11 C15,12.6 9,12.6 4.4,11 Z M8.2,12 h1.7 v6 H8.2 Z M14.1,12 h1.7 v6 h-1.7 Z',
};

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

  constructor() {
    const zones = s('g', { 'clip-path': 'url(#hud-car-clip)' }, [
      zone('front', { x: 0, y: 0, width: 64, height: 44 }),
      zone('rear', { x: 0, y: 85, width: 64, height: 47 }),
      zone('left', { x: 0, y: 44, width: 21, height: 41 }),
      zone('right', { x: 43, y: 44, width: 21, height: 41 }),
      s('rect', { class: 'hud-car__cabin', x: 21, y: 44, width: 22, height: 41 }),
    ]);
    const svg = s('svg', { class: 'hud-car', viewBox: '0 0 64 132', 'aria-hidden': 'true' }, [
      s('defs', undefined, [s('clipPath', { id: 'hud-car-clip' }, [s('path', { d: BODY })])]),
      zone('suspension', { x: 6, y: 22, width: 5.5, height: 16, rx: 1.6 }),
      zone('suspension', { x: 52.5, y: 22, width: 5.5, height: 16, rx: 1.6 }),
      zone('suspension', { x: 6, y: 86, width: 5.5, height: 16, rx: 1.6 }),
      zone('suspension', { x: 52.5, y: 86, width: 5.5, height: 16, rx: 1.6 }),
      zones,
      s('path', { class: 'hud-car__seams', d: 'M8,44 H56 M8,85 H56 M21,44 V85 M43,44 V85' }),
      s('path', { class: 'hud-car__glass', d: GLASS }),
      s('path', { class: 'hud-car__outline', d: BODY }),
      zone('aero', { x: 13, y: 4, width: 38, height: 3, rx: 1 }),
      zone('aero', { x: 9, y: 113, width: 46, height: 5, rx: 1 }),
    ]);
    const systems = h('div', 'hud-systems');
    for (const key of ['engine', 'suspension', 'aero'] as const) {
      const icon = s('svg', { class: 'hud-sys__icon', viewBox: '0 0 24 24', 'aria-hidden': 'true' }, [
        s('path', { class: `hud-dmg hud-sys__${key}`, 'data-k': key, d: ICONS[key] }),
      ]);
      const pct = h('span', 'hud-sys__pct');
      const label = key === 'engine' ? 'ENG' : key === 'suspension' ? 'SUSP' : 'AERO';
      const row = h('div', 'hud-sys', { 'data-ok': 'true' }, [icon, h('span', 'hud-micro', undefined, [label]), pct]);
      this.pct.set(key, { text: new TextSlot(pct), ok: new AttrSlot(row, 'data-ok') });
      systems.append(row);
    }
    this.el = h('div', 'hud-damage', { 'data-pristine': 'true' }, [svg, systems]);
    this.pristine = new AttrSlot(this.el, 'data-pristine');
    this.el.querySelectorAll<SVGElement>('.hud-dmg').forEach((el) => {
      const key = el.getAttribute('data-k') as DamageKey;
      const list = this.parts.get(key) ?? [];
      list.push({ d1: new VarSlot(el, '--d1', 20), d2: new VarSlot(el, '--d2', 20) });
      this.parts.set(key, list);
    });
  }

  update(d: Damage): void {
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
