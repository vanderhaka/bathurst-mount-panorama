// Tiny DOM helpers shared by the HUD and menus. The *Slot classes cache the last
// written value so the 60 fps update loop only touches the DOM on change.

type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, attrs?: Attrs, children?: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (children) for (const c of children) if (c) el.append(c);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(tag: K, attrs?: Attrs, children?: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== false) el.setAttribute(k, String(v));
  if (children) for (const c of children) if (c) el.append(c);
  return el;
}

/** Text node writer that skips identical writes. */
export class TextSlot {
  private value: string | null = null;
  constructor(readonly el: Element) {}
  set(text: string): void {
    if (text === this.value) return;
    this.value = text;
    this.el.textContent = text;
  }
}

/** Attribute writer (e.g. data-state) that skips identical writes. */
export class AttrSlot {
  private value: string | null = null;
  constructor(
    readonly el: Element,
    private readonly name: string,
  ) {}
  set(value: string): void {
    if (value === this.value) return;
    this.value = value;
    this.el.setAttribute(this.name, value);
  }
}

/** `hidden` writer that skips identical writes. */
export class HiddenSlot {
  private value: boolean | null = null;
  constructor(readonly el: HTMLElement) {}
  set(hidden: boolean): void {
    if (hidden === this.value) return;
    this.value = hidden;
    this.el.hidden = hidden;
  }
}

/** Writes a numeric CSS custom property, quantised to `steps` per unit. */
export class VarSlot {
  private value = NaN;
  constructor(
    readonly el: HTMLElement | SVGElement,
    private readonly name: string,
    private readonly steps = 500,
  ) {}
  set(v: number): void {
    const q = Math.round(v * this.steps) / this.steps;
    if (q === this.value) return;
    this.value = q;
    this.el.style.setProperty(this.name, String(q));
  }
}
