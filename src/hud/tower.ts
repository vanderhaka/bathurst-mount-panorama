// Broadcast-style position rows for a solo session: the player against their
// best lap (the ghost), ordered by the live delta, with the interval column.
import type { HudState } from '@/types/hud';
import { AttrSlot, h, TextSlot } from '@/hud/dom';
import { formatDelta } from '@/hud/format';

const MINUS = '−';

interface Row {
  el: HTMLElement;
  pos: TextSlot;
  order: AttrSlot;
  gap: TextSlot;
  gapKind: AttrSlot;
}

function row(cls: string, numEl: Element, code: Element, sub: string): Row {
  const pos = h('span', 'hud-pos__n');
  const gap = h('span', 'hud-pos__gap');
  const el = h('li', `hud-pos ${cls}`, { 'data-order': '1', 'data-gap': 'lead' }, [
    pos,
    h('i', 'hud-pos__stripe'),
    numEl,
    code,
    h('span', 'hud-pos__sub', undefined, [sub]),
    gap,
  ]);
  return { el, pos: new TextSlot(pos), order: new AttrSlot(el, 'data-order'), gap: new TextSlot(gap), gapKind: new AttrSlot(el, 'data-gap') };
}

function signed(d: number): string {
  const t = formatDelta(d);
  return t[0] === '-' ? MINUS + t.slice(1) : t;
}

export class PositionTower {
  readonly el: HTMLElement;
  private readonly you: Row;
  private readonly best: Row;
  private readonly num = new TextSlot(h('span', 'hud-pos__num'));
  private readonly code = new TextSlot(h('span', 'hud-pos__code'));
  private readonly bestOn: AttrSlot;
  private colour = '';

  constructor() {
    this.you = row('is-you', this.num.el, this.code.el, 'LIVE');
    this.best = row('is-best', h('span', 'hud-pos__num hud-pos__ghost', { 'aria-hidden': 'true' }), h('span', 'hud-pos__code', undefined, ['BEST']), 'GHOST');
    this.el = h('ol', 'hud-tower__rows', { 'aria-label': 'Positions', 'data-best': 'false' }, [this.you.el, this.best.el]);
    this.bestOn = new AttrSlot(this.el, 'data-best');
  }

  update(st: HudState): void {
    const entry = st.entry;
    this.num.set(entry ? String(entry.number) : '');
    this.code.set(entry?.code ?? 'YOU');
    const colour = entry?.colour ?? '';
    if (colour !== this.colour) {
      this.colour = colour;
      this.you.el.style.setProperty('--team', colour || 'var(--hud-accent)');
    }
    const d = st.lap.deltaS;
    const hasBest = st.lap.bestS !== null;
    this.bestOn.set(hasBest ? 'true' : 'false');
    const youLead = d === null || d <= 0;
    const [lead, chase] = youLead ? [this.you, this.best] : [this.best, this.you];
    lead.pos.set('1');
    lead.order.set('1');
    lead.gap.set(hasBest ? 'LEADER' : `LAP ${Math.max(1, st.lap.number)}`);
    lead.gapKind.set('lead');
    chase.pos.set('2');
    chase.order.set('2');
    chase.gap.set(d === null ? '' : signed(Math.abs(d)));
    chase.gapKind.set('gap');
  }
}
