// Small DOM stand-in for the menus in Node tests: a tree with classes, attributes, text,
// bubbling events and focus. Layout is not modelled (scrollIntoView only records calls).
import { vi } from 'vitest';

type Listener = (event: Event) => void;

export class MenuNode {
  className = '';
  hidden = false;
  parent: MenuNode | null = null;
  readonly children: MenuNode[] = [];
  readonly text: string[] = [];
  readonly attributes: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> & { setProperty(k: string, v: string): void } = { setProperty: (k, v) => { this.style[k] = v; } } as Record<string, string> & { setProperty(k: string, v: string): void };
  scrolledIntoView = 0;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(readonly tagName: string, private readonly doc: MenuDocument) {}

  readonly classList = {
    add: (name: string): void => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
    remove: (name: string): void => { this.className = this.className.split(' ').filter((c) => c && c !== name).join(' '); },
    toggle: (name: string, on: boolean): void => (on ? this.classList.add(name) : this.classList.remove(name)),
    contains: (name: string): boolean => this.className.split(' ').includes(name),
  };

  get textContent(): string { return [...this.text, ...this.children.map((c) => c.textContent)].join(''); }
  set textContent(value: string) { this.children.length = 0; this.text.length = 0; this.text.push(value); }

  setAttribute(k: string, v: string): void {
    this.attributes[k] = v;
    if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_s, c: string) => c.toUpperCase())] = v;
  }
  getAttribute(k: string): string | null { return this.attributes[k] ?? null; }

  append(...nodes: Array<MenuNode | string>): void {
    for (const n of nodes) {
      if (typeof n === 'string') this.text.push(n);
      else { n.remove(); n.parent = this; this.children.push(n); }
    }
  }
  replaceChildren(...nodes: Array<MenuNode | string>): void {
    for (const c of this.children) c.parent = null;
    this.children.length = 0;
    this.text.length = 0;
    this.append(...nodes);
  }
  replaceWith(next: MenuNode): void {
    const p = this.parent;
    if (!p) return;
    p.children[p.children.indexOf(this)] = next;
    next.parent = p;
    this.parent = null;
  }
  remove(): void {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  contains(node: unknown): boolean { return node === this || this.children.some((c) => c.contains(node)); }
  closest(selector: string): MenuNode | null { return this.matches(selector) ? this : this.parent?.closest(selector) ?? null; }
  querySelectorAll(selector: string): MenuNode[] {
    return this.children.flatMap((c) => [...(c.matches(selector) ? [c] : []), ...c.querySelectorAll(selector)]);
  }
  /** Class (`.x`), attribute (`[data-x]`) or tag selectors only. */
  matches(selector: string): boolean {
    if (selector.startsWith('.')) return this.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) return selector.slice(1, -1) in this.attributes;
    return this.tagName === selector;
  }

  addEventListener(type: string, fn: Listener): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener(type: string, fn: Listener): void { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  /** Bubbles from this node to the root. */
  dispatch(type: string): void {
    const event = { type, target: this, preventDefault() {}, stopPropagation() {} } as unknown as Event;
    for (let n: MenuNode | null = this; n; n = n.parent) for (const fn of n.listeners.get(type) ?? []) fn(event);
  }
  click(): void { this.dispatch('click'); }
  focus(): void { this.doc.activeElement = this; this.dispatch('focus'); this.dispatch('focusin'); }
  blur(): void { if (this.doc.activeElement === this) this.doc.activeElement = null; }
  scrollIntoView(): void { this.scrolledIntoView++; }
  getBoundingClientRect(): DOMRect { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 } as DOMRect; }
}

export class MenuDocument {
  activeElement: MenuNode | null = null;
  readonly body = new MenuNode('body', this);
  createElement(tag: string): MenuNode { return new MenuNode(tag, this); }
  createElementNS(_ns: string, tag: string): MenuNode { return new MenuNode(tag, this); }
}

/** Installs the stand-in document and window globals; undo with vi.unstubAllGlobals(). */
export function stubMenuDom(): MenuDocument {
  const doc = new MenuDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
  vi.stubGlobal('getComputedStyle', () => ({ position: 'relative' }));
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {} }));
  vi.stubGlobal('HTMLElement', MenuNode);
  vi.stubGlobal('HTMLInputElement', class {});
  return doc;
}

/** The element whose own text is `label` (e.g. a button's label span), or null. */
export function findText(root: MenuNode, label: string): MenuNode | null {
  if (root.text.includes(label)) return root;
  for (const c of root.children) { const found = findText(c, label); if (found) return found; }
  return null;
}
