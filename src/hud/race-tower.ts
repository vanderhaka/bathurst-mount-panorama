// Race-mode HUD: the running-order tower, the P3/6 position block and the compact badge for phones and the
// minimal HUD. All DOM is preallocated (max field = 8); frames only write what changed.
import type { RaceHud } from '@/types/race';
import { AttrSlot, h, TextSlot } from '@/hud/dom';
import { driverCode, formatInterval, selectRows, TOWER_ROWS } from '@/hud/race-model';

interface RaceRowView {
  pos: TextSlot;
  num: TextSlot;
  code: TextSlot;
  gap: TextSlot;
  show: AttrSlot;
  you: AttrSlot;
  near: AttrSlot;
  gapKind: AttrSlot;
}

function rowView(): { el: HTMLElement; view: RaceRowView } {
  const pos = h('span', 'hud-pos__n');
  const num = h('span', 'hud-pos__num');
  const code = h('span', 'hud-pos__code');
  const gap = h('span', 'hud-pos__gap');
  const el = h('li', 'hud-pos hud-pos--race', { 'data-show': 'false', 'data-you': 'false', 'data-near': 'false', 'data-gap': 'gap' }, [pos, h('i', 'hud-pos__stripe'), num, code, h('span'), gap]);
  return { el, view: { pos: new TextSlot(pos), num: new TextSlot(num), code: new TextSlot(code), gap: new TextSlot(gap), show: new AttrSlot(el, 'data-show'), you: new AttrSlot(el, 'data-you'), near: new AttrSlot(el, 'data-near'), gapKind: new AttrSlot(el, 'data-gap') } };
}

export class RaceTower {
  readonly el: HTMLElement;
  private readonly rows: RaceRowView[] = [];

  constructor() {
    this.el = h('ol', 'hud-tower__rows hud-tower__rows--race', { 'aria-label': 'Running order' });
    for (let i = 0; i < TOWER_ROWS; i++) {
      const { el, view } = rowView();
      this.el.append(el);
      this.rows.push(view);
    }
  }

  update(race: RaceHud): void {
    const picked = selectRows(race.rows, this.rows.length);
    const playerIdx = race.rows.findIndex((r) => r.isPlayer);
    for (let k = 0; k < this.rows.length; k++) {
      const v = this.rows[k];
      if (k >= picked.length) {
        v.show.set('false');
        continue;
      }
      const i = picked[k];
      const r = race.rows[i];
      const text = formatInterval(race.rows, i);
      v.show.set('true');
      v.pos.set(String(r.position));
      v.num.set(r.number);
      v.code.set(driverCode(r));
      v.gap.set(text);
      v.gapKind.set(i === 0 || r.finished ? 'lead' : 'gap');
      v.you.set(r.isPlayer ? 'true' : 'false');
      v.near.set(Math.abs(i - playerIdx) <= 1 ? 'true' : 'false');
    }
  }
}

/** 'P3' large with '/6' small. */
export class PositionBlock {
  readonly el: HTMLElement;
  private readonly p = new TextSlot(h('b'));
  private readonly total = new TextSlot(h('span'));

  constructor(cls: string) {
    this.el = h('span', cls, { 'aria-label': 'Position' }, [this.p.el, this.total.el]);
  }

  update(race: RaceHud): void {
    this.p.set(`P${race.position}`);
    this.total.set(`/${race.total}`);
  }
}

export function lapLabel(race: RaceHud): string {
  return race.finished ? 'FINISHED' : `LAP ${race.lap}/${race.laps}`;
}

/** Top-left badge for phones and the minimal HUD, where the timing panel is hidden or too tall. */
export class RaceBadge {
  readonly el: HTMLElement;
  private readonly pos = new PositionBlock('hud-racebadge__pos');
  private readonly lap = new TextSlot(h('span', 'hud-racebadge__lap'));
  private readonly on: AttrSlot;

  constructor() {
    this.el = h('div', 'hud-racebadge', { 'data-on': 'false' }, [this.pos.el, this.lap.el]);
    this.on = new AttrSlot(this.el, 'data-on');
  }

  update(race: RaceHud | undefined): void {
    this.on.set(race ? 'true' : 'false');
    if (!race) return;
    this.pos.update(race);
    this.lap.set(lapLabel(race));
  }
}
