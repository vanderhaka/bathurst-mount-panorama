/** Minimal DOM helpers and styling for the audio harness (plain DOM, no framework). */
const CSS = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; background: #0b0e13; color: #d5dbe4; font: 13px/1.4 -apple-system, 'Barlow', system-ui, sans-serif; }
h1 { font: 600 16px/1.2 -apple-system, system-ui, sans-serif; margin: 0; letter-spacing: .02em; }
h2 { font: 600 12px/1.2 system-ui, sans-serif; margin: 14px 0 6px; color: #9aa6b6; text-transform: uppercase; letter-spacing: .08em; }
header { display: flex; align-items: center; gap: 14px; padding: 10px 16px; border-bottom: 1px solid #1d2430; background: #10141b; }
.badge { padding: 2px 8px; border-radius: 3px; font: 600 11px ui-monospace, Menlo, monospace; background: #232a34; color: #9aa6b6; }
.badge.ok { background: #16391f; color: #7bd88f; } .badge.bad { background: #44201f; color: #ff8a80; }
main { display: grid; grid-template-columns: 340px 1fr; gap: 0; min-height: calc(100vh - 46px); }
main.wide { grid-template-columns: 650px 1fr; }
main.wide section.plots h2 { margin: 6px 0 2px; }
aside { padding: 12px 16px 24px; border-right: 1px solid #1d2430; background: #0f131a; }
section.plots { padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
.row { display: grid; grid-template-columns: 78px 1fr 52px; gap: 8px; align-items: center; margin: 3px 0; }
.row label { color: #9aa6b6; } .row output { font: 12px ui-monospace, Menlo, monospace; text-align: right; }
input[type=range] { width: 100%; accent-color: #d9a441; }
select, button { background: #1a212b; color: #d5dbe4; border: 1px solid #2c3644; border-radius: 3px; padding: 5px 9px; font: inherit; }
button { cursor: pointer; } button:hover { background: #232d3a; } button.primary { background: #b8862b; border-color: #d9a441; color: #15110a; font-weight: 600; }
button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid #d9a441; outline-offset: 1px; }
.btns { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
canvas { width: 100%; border: 1px solid #1d2430; background: #0e1116; display: block; }
.status { font: 12px ui-monospace, Menlo, monospace; color: #9aa6b6; white-space: pre-wrap; margin-top: 10px; }
table { border-collapse: collapse; width: 100%; font: 11px ui-monospace, Menlo, monospace; }
th, td { padding: 1px 5px; text-align: right; border-bottom: 1px solid #1a212b; white-space: nowrap; } th:first-child, td:first-child { text-align: left; }
th { color: #9aa6b6; font-weight: 500; } td.ok { color: #7bd88f; } td.bad { color: #ff8a80; }
`;

export function injectStyles(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const icon = document.createElement('link');
  icon.rel = 'icon';
  icon.href = 'data:,';
  document.head.appendChild(icon);
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) node.append(c);
  return node;
}

export function canvas(width: number, height: number, label: string): HTMLCanvasElement {
  const c = el('canvas');
  c.width = width;
  c.height = height;
  c.setAttribute('role', 'img');
  c.setAttribute('aria-label', label);
  return c;
}

export function fmt(n: number, digits = 1): string {
  return Number.isFinite(n) ? n.toFixed(digits) : 'NaN';
}
