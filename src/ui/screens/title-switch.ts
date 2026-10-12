// Title screen: the map panel shown in the right column while another circuit is built in place
// (no full-screen loading screen). Reuses the loading screen's outline drawing and progress bar.
import { h, s, TextSlot } from '@/hud/dom';
import { CIRCUITS, type CircuitId } from '@/track/circuits';
import { OUTLINE_VIEWBOX, trackOutlinePath } from '@/ui/track-outline';

export class CircuitSwitchStatus {
  readonly el = h('div', 'mn-switch', { role: 'status', 'aria-live': 'polite', hidden: true });
  private readonly name = new TextSlot(h('p', 'mn-switch__name'));
  private readonly label = new TextSlot(h('span', 'mn-loading__label'));
  private readonly pct = new TextSlot(h('span', 'mn-loading__pct'));
  private readonly bar = h('div', 'mn-progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': 'Loading circuit' }, [h('i', 'mn-progress__fill')]);
  private readonly art = h('span', 'mn-switch__art');
  private draw: SVGPathElement | null = null;
  private head: SVGCircleElement | null = null;
  private shown: CircuitId | null = null;

  constructor() {
    this.el.append(this.art, h('div', 'mn-switch__body', undefined, [this.name.el, this.bar, h('div', 'mn-loading__meta', undefined, [this.label.el, this.pct.el])]));
  }

  /** Progress 0..1 towards `target`; the small outline is redrawn only when the target changes. */
  show(target: CircuitId, progress: number, label: string): void {
    if (this.shown !== target) this.setTarget(target);
    const p = Math.max(0, Math.min(1, progress));
    this.el.hidden = false;
    this.el.setAttribute('data-failed', 'false');
    this.label.set(label);
    this.pct.set(`${Math.round(p * 100)}%`);
    this.bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
    this.bar.style.setProperty('--p', String(p));
    if (!this.draw || !this.head) return;
    this.draw.style.strokeDashoffset = String(1 - p);
    try {
      const pt = this.draw.getPointAtLength(p * this.draw.getTotalLength());
      this.head.setAttribute('cx', pt.x.toFixed(1));
      this.head.setAttribute('cy', pt.y.toFixed(1));
    } catch { /* geometry is unavailable in some environments; the dot stays at the start */ }
  }

  /** The switch failed: the message stays until the next request. */
  fail(message: string): void {
    this.el.hidden = false;
    this.el.setAttribute('data-failed', 'true');
    this.name.set(message);
    this.label.set('');
    this.pct.set('');
    this.shown = null;
    this.art.replaceChildren();
  }

  hide(): void {
    this.el.hidden = true;
    this.shown = null;
  }

  private setTarget(target: CircuitId): void {
    this.shown = target;
    this.name.set(`Loading ${CIRCUITS[target].name}`);
    const d = trackOutlinePath(target);
    const [sx, sy] = (d.match(/-?[\d.]+/g) ?? ['0', '0']).slice(0, 2).map(Number);
    this.draw = s('path', { class: 'mn-loading__draw', d, pathLength: 1 });
    this.head = s('circle', { class: 'mn-loading__head', cx: sx, cy: sy, r: 9 });
    const sf = s('g', { class: 'mn-loading__sf', transform: `translate(${sx} ${sy})` }, [s('rect', { x: -14, y: -3, width: 28, height: 6 }), s('text', { x: 22, y: 5 }, ['S/F'])]);
    this.art.replaceChildren(s('svg', { viewBox: `0 0 ${OUTLINE_VIEWBOX.w} ${OUTLINE_VIEWBOX.h}`, 'aria-hidden': 'true' }, [s('path', { class: 'mn-loading__ghost', d }), this.draw, sf, this.head]));
  }
}
