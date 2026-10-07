// Session results: best lap per car, lap table with purple / green bests.
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { h } from '@/hud/dom';
import { formatLapTime, formatSectorTime } from '@/hud/format';
import type { LapRecord } from '@/types/session';
import { CAR_ORDER } from '@/ui/car-data';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS } from '@/ui/screen';

export interface ResultsActions {
  again(): void;
  changeCar(): void;
  menu(): void;
}

/** Rows shown in the lap table (most recent laps). */
const MAX_ROWS = 12;

function bestCard(car: CarKind, lap: LapRecord | undefined, overall: boolean): HTMLElement {
  return h('article', `mn-best ${overall ? 'is-overall' : ''}`, undefined, [
    h('header', 'mn-best__head', undefined, [
      h('span', 'mn-best__car', undefined, [CAR_SPECS[car].shortName]),
      overall ? h('span', 'mn-tag mn-tag--ob', undefined, ['Fastest']) : null,
    ]),
    h('p', 'mn-best__time', undefined, [lap ? formatLapTime(lap.timeS) : 'No valid lap']),
    h(
      'p',
      'mn-best__sectors',
      undefined,
      lap ? lap.sectorsS.map((t, i) => h('span', undefined, undefined, [h('small', undefined, undefined, [`S${i + 1}`]), formatSectorTime(t)])) : [],
    ),
  ]);
}

export class ResultsScreen implements Screen {
  readonly id = 'results' as const;
  readonly el = screenEl('results', 'Session results', 'mn-screen--dim');
  private readonly buttons: HTMLButtonElement[];
  private readonly summary = h('p', 'mn-results__summary');
  private readonly cards = h('div', 'mn-bests');
  private readonly body = h('tbody');

  constructor(actions: ResultsActions) {
    this.buttons = [
      menuButton('Race again', actions.again, { variant: 'primary' }),
      menuButton('Change car', actions.changeCar),
      menuButton('Main menu', actions.menu),
    ];
    const head = h('tr', undefined, undefined, ['Lap', 'Car', 'Time', 'S1', 'S2', 'S3', ''].map((t) => h('th', undefined, { scope: 'col' }, [t])));
    this.el.append(
      h('div', 'mn-panel mn-panel--results', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Session'), h('h2', 'mn-h2', undefined, ['Results']), this.summary]),
        this.cards,
        h('div', 'mn-table-wrap', undefined, [h('table', 'mn-table', undefined, [h('caption', 'mn-sr', undefined, ['Lap times']), h('thead', undefined, undefined, [head]), this.body])]),
        h('footer', 'mn-panel__foot mn-panel__foot--buttons', undefined, this.buttons),
      ]),
      hintBar([['←→', 'DPAD', 'Select'], ...STD_HINTS.slice(1)]),
    );
  }

  set(laps: LapRecord[], bestByCar: Partial<Record<CarKind, LapRecord>>): void {
    const valid = laps.filter((l) => l.valid);
    const overall = valid.reduce<LapRecord | null>((a, l) => (a === null || l.timeS < a.timeS ? l : a), null);
    const sectorBest = [0, 1, 2].map((i) => Math.min(...valid.map((l) => l.sectorsS[i] ?? Infinity)));
    this.summary.textContent = `${laps.length} ${laps.length === 1 ? 'lap' : 'laps'} · ${valid.length} valid`;
    this.cards.replaceChildren(...CAR_ORDER.map((car) => bestCard(car, bestByCar[car], !!overall && bestByCar[car] === overall)));
    const start = Math.max(0, laps.length - MAX_ROWS);
    const rows = laps.slice(start).map((lap, k) => {
      const isOverall = lap === overall;
      const isCarBest = !isOverall && lap === bestByCar[lap.car];
      const timeCls = !lap.valid ? 'is-invalid' : isOverall ? 'is-ob' : isCarBest ? 'is-pb' : '';
      return h('tr', lap.valid ? '' : 'is-invalid', undefined, [
        h('td', 'mn-num', undefined, [String(start + k + 1)]),
        h('td', undefined, undefined, [CAR_SPECS[lap.car].shortName]),
        h('td', `mn-time ${timeCls}`, undefined, [formatLapTime(lap.timeS)]),
        ...[0, 1, 2].map((i) => {
          const t = lap.sectorsS[i] ?? null;
          return h('td', `mn-num ${lap.valid && t !== null && t === sectorBest[i] ? 'is-ob' : ''}`, undefined, [formatSectorTime(t)]);
        }),
        h('td', undefined, undefined, [lap.valid ? '' : h('span', 'mn-tag mn-tag--bad', undefined, ['Invalid'])]),
      ]);
    });
    this.body.replaceChildren(...rows);
    if (laps.length === 0) this.body.append(h('tr', undefined, undefined, [h('td', 'mn-empty', { colspan: 7 }, ['No laps completed yet.'])]));
  }

  items(): HTMLElement[] {
    return this.buttons;
  }

  back(): void {
    this.buttons[2].click();
  }
}
