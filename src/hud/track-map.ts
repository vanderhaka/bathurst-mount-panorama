// Top-right track map: static canvas (redrawn only on resize or sector-state
// change), player arrow and ghost dot moved with transforms, corner + altitude.
import type { HudState, HudTrackInfo, SectorState } from '@/types/hud';
import { AttrSlot, h, s, TextSlot } from '@/hud/dom';
import { sectorColourVar } from '@/hud/indicators';
import { bestFitRotation, fitTransform, headingToCssDeg, type MapTransform, nextCornerAfter, outlineIndex, project } from '@/hud/map-geometry';

/** The map is rotated once for this aspect so the layout is stable at every size. */
const MAP_ASPECT = 1.5;

export class TrackMap {
  readonly el: HTMLElement;
  private readonly view = h('div', 'hud-map__view');
  private readonly canvas = h('canvas', 'hud-map__canvas');
  private readonly car = h('i', 'hud-map__car');
  private readonly carArrow = h('i', 'hud-map__arrow');
  private readonly ghost = h('i', 'hud-map__ghost');
  private readonly ghostOn: AttrSlot;
  private readonly turn = new TextSlot(h('span', 'hud-map__turn'));
  private readonly turnOn: AttrSlot;
  private readonly corner = new TextSlot(h('span', 'hud-map__corner'));
  private readonly cornerKind: AttrSlot;
  private readonly alt = new TextSlot(h('b', 'hud-map__alt-v'));
  private readonly rotation: number;
  private readonly turnByName = new Map<string, number>();
  private t: MapTransform | null = null;
  private sig = '';
  private states: SectorState[] = [];
  private current = -1;
  private last = { x: NaN, y: NaN, deg: NaN, gx: NaN, gy: NaN };
  private readonly tmp: [number, number] = [0, 0];
  private readonly ro: ResizeObserver;

  constructor(private readonly track: HudTrackInfo) {
    this.rotation = bestFitRotation(track.outline, MAP_ASPECT);
    for (const c of track.corners) if (!this.turnByName.has(c.name)) this.turnByName.set(c.name, c.turn);
    this.carArrow.append(
      s('svg', { viewBox: '-10 -10 20 20', 'aria-hidden': 'true' }, [s('path', { d: 'M0,-9 L6.5,6 L0,2.6 L-6.5,6 Z' })]),
    );
    this.car.append(this.carArrow);
    this.view.append(this.canvas, this.ghost, this.car);
    this.ghostOn = new AttrSlot(this.ghost, 'data-on');
    this.turnOn = new AttrSlot(this.turn.el, 'data-on');
    const foot = h('footer', 'hud-map__foot', { 'data-kind': 'corner' }, [
      h('span', 'hud-map__next', undefined, ['NEXT']),
      this.turn.el,
      this.corner.el,
      h('span', 'hud-map__alt', { title: 'Altitude above sea level' }, [this.alt.el, h('span', 'hud-micro', undefined, ['M ASL'])]),
    ]);
    this.cornerKind = new AttrSlot(foot, 'data-kind');
    this.el = h('section', 'hud-panel hud-map', { 'aria-label': 'Track map' }, [
      h('header', 'hud-panel__head', undefined, [
        h('span', 'hud-micro hud-micro--strong', undefined, ['MOUNT PANORAMA']),
        h('span', 'hud-micro', undefined, [`${(track.lengthM / 1000).toFixed(3)} KM`]),
      ]),
      this.view,
      foot,
    ]);
    this.ro = new ResizeObserver(() => this.redraw());
    this.ro.observe(this.view);
  }

  private redraw(): void {
    const w = this.view.clientWidth;
    const hgt = this.view.clientHeight;
    if (w < 4 || hgt < 4) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(hgt * dpr);
    this.t = fitTransform(this.track.outline, this.rotation, w, hgt, Math.max(8, w * 0.05));
    this.last.x = this.last.gx = NaN;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hgt);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const css = getComputedStyle(this.el);
    const v = (name: string): string => css.getPropertyValue(name).trim();
    const lw = Number(v('--hud-map-line-width')) || 2.6;
    const cur = this.current;
    this.strokeRange(ctx, 0, 1, lw + 3.2, v('--hud-map-casing'));
    const starts = [0, ...this.track.sectorStarts, 1];
    for (let k = 0; k < starts.length - 1; k++) {
      const state = this.states[k] ?? 'none';
      const colour = k === cur ? v('--hud-sector-live') : state === 'none' ? v('--hud-map-line') : v(sectorColourVar(state));
      ctx.globalAlpha = k === cur || state !== 'none' ? 1 : 0.5;
      this.strokeRange(ctx, starts[k], starts[k + 1], k === cur ? lw + 0.6 : lw, colour);
    }
    ctx.globalAlpha = 1;
    for (const p of this.track.sectorStarts) this.tick(ctx, p, 4.5, 1.4, v('--hud-text-dim'));
    this.tick(ctx, 0, 7, 3.2, v('--hud-map-casing'));
    this.tick(ctx, 0, 6, 1.8, v('--hud-accent'));
  }

  private strokeRange(ctx: CanvasRenderingContext2D, from: number, to: number, width: number, colour: string): void {
    const pts = this.track.outline;
    const n = pts.length;
    const t = this.t;
    if (!t || n < 2) return;
    const a = outlineIndex(from, n);
    const b = to >= 1 ? n : outlineIndex(to, n);
    ctx.beginPath();
    for (let i = a; i <= b; i++) {
      const [x, z] = pts[i % n];
      project(t, x, z, this.tmp);
      if (i === a) ctx.moveTo(this.tmp[0], this.tmp[1]);
      else ctx.lineTo(this.tmp[0], this.tmp[1]);
    }
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.stroke();
  }

  /** Short line across the track at a lap fraction (start/finish, sector lines). */
  private tick(ctx: CanvasRenderingContext2D, progress: number, half: number, width: number, colour: string): void {
    const pts = this.track.outline;
    const t = this.t;
    if (!t) return;
    const i = outlineIndex(progress, pts.length);
    const [x0, y0] = project(t, pts[i][0], pts[i][1], [0, 0]);
    const [x1, y1] = project(t, pts[(i + 2) % pts.length][0], pts[(i + 2) % pts.length][1], [0, 0]);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    ctx.beginPath();
    ctx.moveTo(x0 - nx * half, y0 - ny * half);
    ctx.lineTo(x0 + nx * half, y0 + ny * half);
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.lineCap = 'butt';
    ctx.stroke();
    ctx.lineCap = 'round';
  }

  update(st: HudState): void {
    let sig = String(st.lap.currentSector);
    for (const sec of st.lap.sectors) sig += sec.state[0] + sec.state[1];
    if (sig !== this.sig || !this.t) {
      this.sig = sig;
      this.states = st.lap.sectors.map((x) => x.state);
      this.current = st.lap.currentSector;
      this.redraw();
    }
    const t = this.t;
    if (!t) return;
    const [px, py] = project(t, st.playerXZ[0], st.playerXZ[1], this.tmp);
    const deg = headingToCssDeg(t, st.playerHeading);
    if (!(Math.abs(px - this.last.x) <= 0.2 && Math.abs(py - this.last.y) <= 0.2 && Math.abs(deg - this.last.deg) <= 1)) {
      this.last.x = px;
      this.last.y = py;
      this.last.deg = deg;
      this.car.style.transform = `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0)`;
      this.carArrow.style.transform = `rotate(${deg.toFixed(1)}deg)`;
    }
    this.ghostOn.set(st.ghostXZ ? 'true' : 'false');
    if (st.ghostXZ) {
      const [gx, gy] = project(t, st.ghostXZ[0], st.ghostXZ[1], this.tmp);
      if (!(Math.abs(gx - this.last.gx) <= 0.2 && Math.abs(gy - this.last.gy) <= 0.2)) {
        this.last.gx = gx;
        this.last.gy = gy;
        this.ghost.style.transform = `translate3d(${gx.toFixed(1)}px,${gy.toFixed(1)}px,0)`;
      }
    }
    this.updateCorner(st);
  }

  /** Turn number for a name; several turns can share one (The Esses), so take the latest one reached. */
  private turnFor(name: string, progress: number): number {
    let turn = this.turnByName.get(name) ?? 0;
    let at = -1;
    for (const c of this.track.corners) {
      if (c.name === name && c.progress <= progress + 0.002 && c.progress > at) {
        at = c.progress;
        turn = c.turn;
      }
    }
    return turn;
  }

  private updateCorner(st: HudState): void {
    const next = st.cornerName ? null : nextCornerAfter(this.track.corners, st.progress);
    const name = st.cornerName ?? next?.name ?? '';
    const turn = next ? next.turn : this.turnFor(name, st.progress);
    this.cornerKind.set(st.cornerName ? 'corner' : 'next');
    this.corner.set(name.toUpperCase());
    this.turn.set(turn > 0 ? `T${turn}` : '');
    this.turnOn.set(turn > 0 ? 'true' : 'false');
    this.alt.set(String(Math.round(st.altitudeAslM)));
  }

  dispose(): void {
    this.ro.disconnect();
  }
}
