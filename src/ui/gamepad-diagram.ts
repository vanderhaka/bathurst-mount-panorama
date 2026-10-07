// Gamepad drawing for the controls screen, in the layout of the connected controller
// family (Xbox: offset sticks; PlayStation: D-pad top left, twin sticks, touchpad).
// Controls bound in BINDINGS are highlighted; the legend next to it lists the actions.
import { h, s } from '@/hud/dom';
import { padName, type PadStyle } from '@/input/pad-style';
import { padLabels } from '@/ui/controls-data';
import { padChip, psFacePath } from '@/ui/pad-glyphs';

const BODY =
  'M220,118 C260,108 380,108 420,118 C460,122 490,132 508,160 C532,200 550,260 548,300 C546,328 520,340 498,326 ' +
  'C476,310 452,272 430,258 C400,246 240,246 210,258 C188,272 164,310 142,326 C120,340 94,328 92,300 ' +
  'C90,260 108,200 132,160 C150,132 180,122 220,118 Z';

type Shape = { kind: 'rect'; x: number; y: number; w: number; h: number; r: number } | { kind: 'circle'; x: number; y: number; r: number; inner?: number };
type Control = { label: string; glyph: string; shape: Shape; behind?: boolean };

/** Shared controls (shoulders, triggers, face buttons). `label` is the standard name used in BINDINGS. */
const COMMON: Control[] = [
  { label: 'LT', glyph: 'LT', shape: { kind: 'rect', x: 188, y: 56, w: 50, h: 28, r: 9 } },
  { label: 'RT', glyph: 'RT', shape: { kind: 'rect', x: 402, y: 56, w: 50, h: 28, r: 9 } },
  { label: 'LB', glyph: 'LB', shape: { kind: 'rect', x: 168, y: 92, w: 82, h: 22, r: 10 }, behind: true },
  { label: 'RB', glyph: 'RB', shape: { kind: 'rect', x: 390, y: 92, w: 82, h: 22, r: 10 }, behind: true },
  { label: 'Y', glyph: 'Y', shape: { kind: 'circle', x: 402, y: 150, r: 12.5 } },
  { label: 'X', glyph: 'X', shape: { kind: 'circle', x: 378, y: 174, r: 12.5 } },
  { label: 'B', glyph: 'B', shape: { kind: 'circle', x: 426, y: 174, r: 12.5 } },
  { label: 'A', glyph: 'A', shape: { kind: 'circle', x: 402, y: 198, r: 12.5 } },
];

const LAYOUT: Record<'xbox' | 'playstation', { controls: Control[]; dpad: [number, number]; extra: (cls: string) => SVGElement[] }> = {
  xbox: {
    controls: [
      { label: 'Left stick', glyph: 'LS', shape: { kind: 'circle', x: 238, y: 176, r: 28, inner: 19 } },
      { label: 'Right stick', glyph: 'RS', shape: { kind: 'circle', x: 360, y: 232, r: 25, inner: 17 } },
      { label: 'View', glyph: '', shape: { kind: 'rect', x: 281, y: 167, w: 20, h: 12, r: 6 } },
      { label: 'Menu', glyph: '', shape: { kind: 'rect', x: 339, y: 167, w: 20, h: 12, r: 6 } },
    ],
    dpad: [282, 232],
    extra: (cls) => [s('circle', { class: cls, cx: 320, cy: 146, r: 12 })],
  },
  playstation: {
    controls: [
      { label: 'Left stick', glyph: 'LS', shape: { kind: 'circle', x: 280, y: 238, r: 25, inner: 17 } },
      { label: 'Right stick', glyph: 'RS', shape: { kind: 'circle', x: 360, y: 238, r: 25, inner: 17 } },
      { label: 'View', glyph: '', shape: { kind: 'rect', x: 252, y: 124, w: 12, h: 20, r: 6 } },
      { label: 'Menu', glyph: '', shape: { kind: 'rect', x: 376, y: 124, w: 12, h: 20, r: 6 } },
    ],
    dpad: [238, 176],
    extra: (cls) => [
      s('rect', { class: cls, x: 274, y: 118, width: 92, height: 50, rx: 9 }), // touchpad
      s('circle', { class: cls, cx: 320, cy: 202, r: 9 }), // PS button
    ],
  },
};

function control(shape: Shape, label: string, glyph: string, style: PadStyle, cls: string): SVGGElement {
  const g = s('g', { class: cls });
  const text = glyph ? padName(glyph, style) : '';
  const sym = psFacePath(glyph, style);
  if (shape.kind === 'rect') {
    g.append(s('rect', { x: shape.x, y: shape.y, width: shape.w, height: shape.h, rx: shape.r }));
    if (text) g.append(s('text', { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 + 4.5 }, [text]));
  } else {
    g.append(s('circle', { cx: shape.x, cy: shape.y, r: shape.r }));
    if (shape.inner) g.append(s('circle', { class: 'mn-gp__cap', cx: shape.x, cy: shape.y, r: shape.inner }));
    if (sym) g.append(s('path', { class: 'mn-gp__sym', d: sym, transform: `translate(${shape.x},${shape.y}) scale(0.9)` }));
    else if (text) g.append(s('text', { x: shape.x, y: shape.y + 4.5 }, [text]));
  }
  g.setAttribute('aria-label', label);
  return g;
}

export function gamepadDiagram(style: PadStyle): HTMLElement {
  const layout = LAYOUT[style === 'xbox' ? 'xbox' : 'playstation'];
  const bound = padLabels();
  const behind: SVGElement[] = [];
  const front: SVGElement[] = [];
  for (const c of [...COMMON, ...layout.controls]) {
    const el = control(c.shape, c.label, c.glyph, style, `mn-gp__ctl ${bound.has(c.label) ? 'is-bound' : ''} mn-gp__ctl--${c.glyph ? c.shape.kind : 'small'}`);
    (c.behind ? behind : front).push(el);
  }
  const [dx, dy] = layout.dpad;
  const dpad = s('g', { class: 'mn-gp__ctl mn-gp__dpad is-bound' }, [
    s('path', { d: `M${dx - 7},${dy - 20} h14 v13 h13 v14 h-13 v13 h-14 v-13 h-13 v-14 h13 Z` }),
  ]);
  const svg = s('svg', { class: 'mn-gp', viewBox: '80 46 480 300', role: 'img', 'aria-label': 'Gamepad layout' }, [
    ...behind,
    s('path', { class: 'mn-gp__body', d: BODY }),
    ...layout.extra('mn-gp__guide'),
    ...front,
    dpad,
  ]);
  const legend = h('dl', 'mn-gp-legend');
  const order = ['RT', 'LT', 'Left stick', 'A', 'X', 'Y', 'B', 'View', 'Menu', 'LB', 'RB'];
  for (const label of order) {
    const action = bound.get(label);
    if (!action) continue;
    legend.append(h('div', 'mn-gp-legend__row', undefined, [h('dt', undefined, undefined, [padGlyph(label)]), h('dd', undefined, undefined, [action])]));
  }
  legend.append(h('div', 'mn-gp-legend__row', undefined, [h('dt', undefined, undefined, [padGlyph('DPAD')]), h('dd', undefined, undefined, ['Menu navigation'])]));
  return h('div', 'mn-gp-wrap', undefined, [svg, legend]);
}

/** Inline glyph chip for a gamepad control label (follows the controller family). */
export function padGlyph(label: string): HTMLElement {
  const name = label === 'Left stick' ? 'LS' : label === 'Right stick' ? 'RS' : label;
  return padChip(name, label);
}
