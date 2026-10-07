/** Small event/layout fixture. Phone rendering and real sensor prompts still need device play. */
export class TouchElement {
  className = '';
  readonly dataset: Record<string, string> = {};
  readonly children: TouchElement[] = [];
  readonly text: string[] = [];
  parent: TouchElement | null = null;
  textContent = '';
  disabled = false;
  clientWidth = 800;
  clientHeight = 400;
  rect = { left: 0, top: 0, width: 100, height: 100 };
  readonly attributes: Record<string, string> = {};
  readonly properties: Record<string, string> = {};
  readonly style = { width: '', left: '', top: '', setProperty: (k: string, v: string) => { this.properties[k] = v; } };
  readonly classList = { toggle: (name: string, on: boolean) => {
    const names = new Set(this.className.split(' ').filter(Boolean));
    if (on) names.add(name); else names.delete(name);
    this.className = [...names].join(' ');
  } };
  private readonly listeners = new Map<string, Array<(event: Event) => void>>();
  constructor(readonly tag = 'div') {}
  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_s, c: string) => c.toUpperCase())] = v;
  }
  append(...children: Array<TouchElement | string>) {
    for (const child of children) {
      if (typeof child === 'string') this.text.push(child);
      else { child.parent = this; this.children.push(child); }
    }
  }
  contains(target: TouchElement): boolean { return this === target || this.children.some((c) => c.contains(target)); }
  closest(selector: string): TouchElement | null {
    const matches = selector.startsWith('.') ? this.className.split(' ').includes(selector.slice(1))
      : selector === '[data-steer]' && !!this.dataset.steer;
    return matches ? this : this.parent?.closest(selector) ?? null;
  }
  getBoundingClientRect() { return { ...this.rect, right: this.rect.left + this.rect.width, bottom: this.rect.top + this.rect.height }; }
  setPointerCapture() {}
  releasePointerCapture() {}
  remove() { if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  addEventListener(type: string, fn: (e: Event) => void) { this.listeners.set(type, [...this.listeners.get(type) ?? [], fn]); }
  removeEventListener(type: string, fn: (e: Event) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((x) => x !== fn)); }
  dispatch(type: string, values: object = {}) {
    const e = { target: this, preventDefault() {}, stopPropagation() {}, ...values } as unknown as Event;
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
  find(cls: string): TouchElement {
    if (this.className.split(' ').includes(cls)) return this;
    for (const child of this.children) {
      if (child.className.split(' ').includes(cls)) return child;
      const found = child.search(cls);
      if (found) return found;
    }
    throw new Error(`Missing ${cls}`);
  }
  private search(cls: string): TouchElement | null {
    if (this.className.split(' ').includes(cls)) return this;
    for (const child of this.children) { const found = child.search(cls); if (found) return found; }
    return null;
  }
}
