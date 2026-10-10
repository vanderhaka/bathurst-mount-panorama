// Top-centre live delta: a mono signed value beside a thin centred bar with a
// sliding marker (left = faster, right = slower) against the best lap.
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
  private readonly bar = h('div', 'hud-delta__bar');
  private readonly frac = new VarSlot(this.bar, '--f', 400);

  constructor() {
    const ticks = h('i', 'hud-delta__ticks', { 'aria-hidden': 'true' });
    for (let k = -RANGE_S; k <= RANGE_S + 1e-6; k += 0.5) {
      if (Math.abs(k) < 1e-6) continue;
      ticks.append(h('i', undefined, { style: `left:${(50 + (k / RANGE_S) * 50).toFixed(3)}%` }));
    }
    this.bar.append(ticks, h('i', 'hud-delta__fill'), h('i', 'hud-delta__zero'), h('i', 'hud-delta__marker'));
    this.el = h('section', 'hud-panel hud-panel--tr hud-delta', { 'aria-label': 'Live delta to best lap', 'data-delta': 'none' }, [
      h('div', 'hud-delta__num', undefined, [h('span', 'hud-micro', undefined, ['DELTA']), this.value.el]),
      h('div', 'hud-delta__gauge', undefined, [
        this.bar,
        h('div', 'hud-delta__scale', { 'aria-hidden': 'true' }, [h('span', 'hud-delta__ref', undefined, [this.refLabel.el, this.ref.el])]),
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
