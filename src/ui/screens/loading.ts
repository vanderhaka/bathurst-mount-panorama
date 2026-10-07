// Loading screen: the circuit outline draws itself as loading progresses.
import { h, s, TextSlot } from '@/hud/dom';
import { type Screen, screenEl } from '@/ui/screen';
import { OUTLINE_VIEWBOX, trackOutlinePath } from '@/ui/track-outline';

export class LoadingScreen implements Screen {
  readonly id = 'loading' as const;
  readonly el = screenEl('loading', 'Loading');
  private readonly label = new TextSlot(h('span', 'mn-loading__label'));
  private readonly pct = new TextSlot(h('span', 'mn-loading__pct'));
  private readonly bar = h('div', 'mn-progress', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0, 'aria-label': 'Loading' }, [
    h('i', 'mn-progress__fill'),
  ]);
  private readonly draw: SVGPathElement;
  private readonly head: SVGCircleElement;
  private last = -1;

  constructor() {
    const d = trackOutlinePath();
    this.draw = s('path', { class: 'mn-loading__draw', d, pathLength: 1 });
    const [sx, sy] = (d.match(/-?[\d.]+/g) ?? ['0', '0']).slice(0, 2).map(Number);
    this.head = s('circle', { class: 'mn-loading__head', cx: sx, cy: sy, r: 7 });
    const art = s('svg', { class: 'mn-loading__art', viewBox: `0 0 ${OUTLINE_VIEWBOX.w} ${OUTLINE_VIEWBOX.h}`, 'aria-hidden': 'true' }, [
      s('path', { class: 'mn-loading__ghost', d }),
      this.draw,
      s('g', { class: 'mn-loading__sf', transform: `translate(${sx} ${sy})` }, [
        s('rect', { x: -14, y: -3, width: 28, height: 6 }),
        s('text', { x: 22, y: 5 }, ['S/F']),
      ]),
      this.head,
    ]);
    this.el.append(
      art,
      h('div', 'mn-loading__body', undefined, [
        h('p', 'mn-kicker', undefined, [h('i', 'mn-kicker__bar', { 'aria-hidden': 'true' }), 'Bathurst · New South Wales']),
        h('h1', 'mn-loading__title', undefined, ['Mount Panorama']),
        this.bar,
        h('div', 'mn-loading__meta', undefined, [this.label.el, this.pct.el]),
      ]),
    );
  }

  items(): HTMLElement[] {
    return [];
  }

  back(): void {}

  set(progress: number, label: string): void {
    const p = Math.max(0, Math.min(1, progress));
    this.label.set(label);
    const pct = Math.round(p * 100);
    if (pct === this.last) return;
    this.last = pct;
    this.pct.set(`${pct}%`);
    this.bar.setAttribute('aria-valuenow', String(pct));
    this.bar.style.setProperty('--p', String(p));
    this.draw.style.strokeDashoffset = String(1 - p);
    try {
      const pt = this.draw.getPointAtLength(p * this.draw.getTotalLength());
      this.head.setAttribute('cx', pt.x.toFixed(1));
      this.head.setAttribute('cy', pt.y.toFixed(1));
    } catch {
      // Geometry is unavailable in some environments; the dot just stays at the start.
    }
  }
}
