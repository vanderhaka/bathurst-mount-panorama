// Centre-top transient message strip (track limits, new best lap, ...). The game
// owns the message lifetime; the banner slides in on a new message and out on null.
import type { HudState } from '@/types/hud';
import { h } from '@/hud/dom';

export class Banner {
  readonly el: HTMLElement;
  private readonly text = h('span', 'hud-banner__text');
  private key = '';

  constructor() {
    this.el = h('div', 'hud-banner', { 'data-on': 'false', 'data-kind': 'info', role: 'status', 'aria-live': 'polite' }, [
      h('i', 'hud-banner__bar'),
      this.text,
      h('i', 'hud-banner__bar'),
    ]);
  }

  update(st: HudState): void {
    const m = st.message;
    const key = m ? `${m.kind}|${m.text}` : '';
    if (key === this.key) return;
    this.key = key;
    if (!m) {
      this.el.dataset.on = 'false';
      return;
    }
    this.text.textContent = m.text;
    this.el.dataset.kind = m.kind;
    // Replay the slide-in when one message replaces another.
    this.el.dataset.on = 'false';
    void this.el.offsetWidth;
    this.el.dataset.on = 'true';
  }
}
