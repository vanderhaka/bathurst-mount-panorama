// Top-centre live delta: large signed number beside a thick centred bar that
// grows left (green, faster) or right (red, slower) against the best lap.
import type { HudState } from '@/types/hud';
import { AttrSlot, h, TextSlot, VarSlot } from '@/hud/dom';
import { deltaBarFraction, deltaClass, formatDelta, formatLapTime } from '@/hud/format';

const MINUS = '−';
const EM_DASH = '\u2014';
/** Bar range: full half-bar = 1.5 s. Tick marks every 0.5 s. */
const RANGE_S = 1.5;

export class DeltaStrip {
  readonly el: HTMLElement;
  private readonly value = new TextSlot(h('span', 'hud-delta__v'));
  private readonly refLabel = new TextSlot(h('span', 'hud-micro'));
  private readonly ref = new TextSlot(h('span', 'hud-delta__ref-v'));
  private readonly state: AttrSlot;
  private readonly hidden: AttrSlot;
  private readonly fill = h('i', 'hud-delta__fill');
  private readonly frac = new VarSlot(this.fill, '--f', 400);

  constructor() {
    const ticks = h('i', 'hud-delta__ticks', { 'aria-hidden': 'true' });
    for (let k = -RANGE_S; k <= RANGE_S + 1e-6; k += 0.5) {
      if (Math.abs(k) < 1e-6) continue;
      ticks.append(h('i', undefined, { style: `left:${(50 + (k / RANGE_S) * 50).toFixed(3)}%` }));
    }
    this.el = h('section', 'hud-panel hud-delta', { 'aria-label': 'Live delta to best lap', 'data-delta': 'none' }, [
      h('div', 'hud-delta__num', undefined, [h('span', 'hud-micro', undefined, ['DELTA']), this.value.el]),
      h('div', 'hud-delta__gauge', undefined, [
        h('div', 'hud-delta__bar', undefined, [ticks, this.fill, h('i', 'hud-delta__zero')]),
        h('div', 'hud-delta__scale', { 'aria-hidden': 'true' }, [
          h('span', 'is-fast', undefined, [`${MINUS}${RANGE_S.toFixed(1)}`]),
          h('span', 'hud-delta__ref', undefined, [this.refLabel.el, this.ref.el]),
          h('span', 'is-slow', undefined, [`+${RANGE_S.toFixed(1)}`]),
        ]),
      ]),
    ]);
    this.state = new AttrSlot(this.el, 'data-delta');
    this.hidden = new AttrSlot(this.el, 'data-hidden');
  }

  update(st: HudState): void {
    // The start-lights gantry takes this spot during the countdown.
    this.hidden.set((st.startLights ?? -1) >= 0 ? 'true' : 'false');
    const d = st.lap.deltaS;
    const best = st.lap.bestS;
    // No reference yet: a clean dash and a plain label instead of placeholder digits.
    const text = d === null ? EM_DASH : formatDelta(d);
    this.value.set(text[0] === '-' ? MINUS + text.slice(1) : text);
    this.state.set(deltaClass(d));
    this.frac.set(deltaBarFraction(d, RANGE_S));
    this.refLabel.set(best === null ? 'NO REFERENCE LAP' : 'VS BEST');
    this.ref.set(best === null ? '' : formatLapTime(best));
  }
}
