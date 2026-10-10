// Top-left broadcast tower: angled LAP block, position rows (you vs best lap),
// big running lap time, last / best, three sector boxes, INVALID marker.
// The live delta has its own strip (delta-strip.ts).
import type { HudState } from '@/types/hud';
import { AttrSlot, h, TextSlot } from '@/hud/dom';
import { formatLapTime, formatSectorTime } from '@/hud/format';
import { sectorClass } from '@/hud/indicators';
import { PositionTower } from '@/hud/tower';

interface SectorView {
  root: AttrSlot;
  live: AttrSlot;
  time: TextSlot;
}

export class TimingPanel {
  readonly el: HTMLElement;
  private readonly lapNo = new TextSlot(h('span', 'hud-laptab__no'));
  private readonly lapWord = new TextSlot(h('span', 'hud-laptab__word'));
  private readonly sectorLabel = new TextSlot(h('span', 'hud-timing__sector'));
  private readonly valid: AttrSlot;
  private readonly bestNone: AttrSlot;
  private readonly current = new TextSlot(h('span', 'hud-timing__current'));
  private readonly last = new TextSlot(h('span', 'hud-kv__v'));
  private readonly best = new TextSlot(h('span', 'hud-kv__v'));
  private readonly sectors: SectorView[] = [];
  private readonly sectorWrap = h('div', 'hud-sectors');
  private readonly tower = new PositionTower();
  private readonly mode = new TextSlot(h('span'));

  constructor(city = 'Bathurst') {
    this.el = h('section', 'hud-panel hud-timing', { 'aria-label': 'Lap timing', 'data-valid': 'true' }, [
      h('header', 'hud-timing__head', undefined, [
        h('span', 'hud-laptab', undefined, [this.lapWord.el, this.lapNo.el]),
        h('span', 'hud-timing__title', undefined, [h('b', undefined, undefined, [city.toUpperCase()]), this.mode.el]),
        h('span', 'hud-chip hud-chip--bad', undefined, ['INVALID']),
      ]),
      this.tower.el,
      h('div', 'hud-timing__now', undefined, [this.current.el, this.sectorLabel.el]),
      h('div', 'hud-timing__rows', undefined, [
        h('div', 'hud-kv', undefined, [h('span', 'hud-micro', undefined, ['LAST']), this.last.el]),
        h('div', 'hud-kv hud-kv--best', { 'data-none': 'false' }, [h('span', 'hud-micro', undefined, ['BEST']), this.best.el]),
      ]),
      this.sectorWrap,
    ]);
    this.valid = new AttrSlot(this.el, 'data-valid');
    this.bestNone = new AttrSlot(this.best.el.parentElement as Element, 'data-none');
  }

  private ensureSectors(count: number): void {
    while (this.sectors.length < count) {
      const i = this.sectors.length;
      const time = h('span', 'hud-sector__t');
      const box = h('div', 'hud-sector', { 'data-state': 'none', 'data-live': 'false' }, [
        h('i', 'hud-sector__bar'),
        h('span', 'hud-sector__n', undefined, [`S${i + 1}`]),
        time,
      ]);
      this.sectorWrap.append(box);
      this.sectors.push({ root: new AttrSlot(box, 'data-state'), live: new AttrSlot(box, 'data-live'), time: new TextSlot(time) });
    }
  }

  update(s: HudState): void {
    const lap = s.lap;
    const warmup = s.shootout && (s.shootout.phase === 'warmup' || s.shootout.phase === 'ready');
    this.mode.set(s.shootout?.mode === 'shootoutTop10' ? 'TOP 10' : s.shootout ? 'ARCADE' : 'PRACTICE');
    this.lapWord.set(warmup ? 'WARM' : lap.number > 0 ? 'LAP' : 'OUT');
    this.lapNo.set(warmup ? 'UP' : lap.number > 0 ? String(lap.number) : 'LAP');
    this.sectorLabel.set(`SECTOR ${lap.currentSector + 1}`);
    this.valid.set(lap.valid ? 'true' : 'false');
    this.current.set(warmup ? 'UNTIMED' : formatLapTime(lap.currentS));
    // No lap yet: a clean dash rather than placeholder digits.
    this.last.set(lap.lastS === null ? '\u2014' : formatLapTime(lap.lastS));
    this.best.set(lap.bestS === null ? '\u2014' : formatLapTime(lap.bestS));
    this.bestNone.set(lap.bestS === null ? 'true' : 'false');
    this.tower.update(s);
    this.ensureSectors(lap.sectors.length);
    for (let i = 0; i < lap.sectors.length; i++) {
      const sec = lap.sectors[i];
      const v = this.sectors[i];
      const live = i === lap.currentSector;
      v.live.set(live ? 'true' : 'false');
      v.root.set(live ? 'none' : sectorClass(sec.state));
      v.time.set(formatSectorTime(live ? null : sec.timeS));
    }
  }
}
