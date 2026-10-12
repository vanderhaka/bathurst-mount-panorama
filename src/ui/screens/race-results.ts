// Race results: the classification (position, number, driver, car, time, best lap) and what to do next.
// Opened from the pause menu mid-race it shows the running order and a Back button instead of Race again.
import '@/ui/race.css';
import { h } from '@/hud/dom';
import type { RaceResult, RaceRow } from '@/types/race';
import { bestLapCell, CAR_CODES, raceHeadline, timeCell } from '@/ui/race-results-model';
import { hintBar, kicker, menuButton, type Screen, screenEl, STD_HINTS } from '@/ui/screen';

export interface RaceResultsActions {
  again(): void;
  /** End the race and go to race setup. */
  change(): void;
  menu(): void;
  /** Back to the pause menu (mid-race only). */
  backToSession(): void;
}

const COLUMNS: ReadonlyArray<readonly [label: string, cls: string]> = [
  ['Pos', 'mn-race__pos'], ['No.', 'mn-race__no'], ['Driver', 'mn-race__driver'], ['Car', 'mn-race__car'], ['Time', 'mn-race__time'], ['Best lap', 'mn-race__best'],
];

function resultRow(r: RaceRow): HTMLElement {
  const cells = [String(r.position), `#${r.number}`, r.name, CAR_CODES[r.car], timeCell(r), bestLapCell(r)];
  return h('tr', r.isPlayer ? 'is-mine' : undefined, r.isPlayer ? { 'aria-label': `You, position ${r.position}` } : undefined,
    cells.map((text, i) => h('td', COLUMNS[i][1], undefined, [text])));
}

export class RaceResultsScreen implements Screen {
  readonly id = 'raceResults' as const;
  readonly el = screenEl('raceResults', 'Race results', 'mn-screen--dim');
  private readonly title = h('h2', 'mn-h2');
  private readonly sub = h('p', 'mn-results__summary');
  private readonly body = h('tbody');
  private readonly again: HTMLButtonElement;
  private readonly change: HTMLButtonElement;
  private readonly menu: HTMLButtonElement;
  private readonly backToSession: HTMLButtonElement;
  private midRace = false;

  constructor(actions: RaceResultsActions) {
    this.again = menuButton('Race again', actions.again, { variant: 'primary' });
    this.backToSession = menuButton('Back', actions.backToSession, { variant: 'primary' });
    this.change = menuButton('Change race', actions.change);
    this.menu = menuButton('Main menu', actions.menu);
    const head = h('tr', undefined, undefined, COLUMNS.map(([t, cls]) => h('th', cls, { scope: 'col' }, [t])));
    this.el.append(
      h('div', 'mn-panel mn-panel--results mn-panel--race-results', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Race'), this.title, this.sub]),
        h('div', 'mn-table-wrap', undefined, [h('table', 'mn-table mn-race-table', undefined, [h('caption', 'mn-sr', undefined, ['Race classification']), h('thead', undefined, undefined, [head]), this.body])]),
        h('footer', 'mn-panel__foot mn-panel__foot--buttons', undefined, [this.again, this.backToSession, this.change, this.menu]),
      ]),
      hintBar([['←→', 'DPAD', 'Select'], ...STD_HINTS.slice(1)]),
    );
    this.set({ circuit: '', laps: 0, skill: 'medium', rows: [] }, false);
  }

  /** `midRace`: opened from the pause menu while the race is still running. */
  set(result: RaceResult, midRace: boolean): void {
    this.midRace = midRace;
    const head = raceHeadline(result);
    this.title.textContent = head.title;
    this.sub.textContent = head.sub;
    this.body.replaceChildren(...result.rows.map(resultRow));
    this.again.hidden = midRace;
    this.backToSession.hidden = !midRace;
  }

  items(): HTMLElement[] {
    return [this.again, this.backToSession, this.change, this.menu].filter((b) => !b.hidden);
  }

  back(): void {
    (this.midRace ? this.backToSession : this.menu).click();
  }
}
