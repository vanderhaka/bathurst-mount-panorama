// Broadcast-style start gantry (top centre): five pods of two red lamps that
// light 1 -> 5 during the countdown, then all go out together and the strip fades.
import type { HudState } from '@/types/hud';
import { AttrSlot, h } from '@/hud/dom';

const PODS = 5;
/** How long the dark gantry stays after lights out (ms), matching the CSS fade. */
const OUT_HOLD_MS = 900;

export class StartLights {
  readonly el: HTMLElement;
  private readonly pods: AttrSlot[] = [];
  private readonly on: AttrSlot;
  private readonly phase: AttrSlot;
  private prev = -1;
  private outAt = -1;

  constructor() {
    this.el = h('section', 'hud-panel hud-panel--tr hud-lights', { 'aria-label': 'Start lights', 'data-on': 'false', 'data-phase': 'count', role: 'status' });
    for (let i = 0; i < PODS; i++) {
      const pod = h('div', 'hud-light', { 'data-lit': 'false' }, [h('i'), h('i')]);
      this.el.append(pod);
      this.pods.push(new AttrSlot(pod, 'data-lit'));
    }
    this.on = new AttrSlot(this.el, 'data-on');
    this.phase = new AttrSlot(this.el, 'data-phase');
  }

  update(st: HudState): void {
    const n = st.startLights;
    if (n === undefined) {
      this.on.set('false');
      return;
    }
    if (n >= 0) {
      this.outAt = -1;
      this.on.set('true');
      this.phase.set('count');
      for (let i = 0; i < PODS; i++) this.pods[i].set(i < n ? 'true' : 'false');
    } else {
      if (this.prev >= 0) this.outAt = performance.now();
      for (const p of this.pods) p.set('false');
      this.phase.set('out');
      this.on.set(this.outAt >= 0 && performance.now() - this.outAt < OUT_HOLD_MS ? 'true' : 'false');
    }
    this.prev = n;
  }
}
