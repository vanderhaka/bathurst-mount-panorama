// Title screen: the live Shootout Top 10 (all cars) on the right. Display only; no focus stops.
import { CAR_SPECS } from '@/car/car-specs';
import { h } from '@/hud/dom';
import { formatLapTime } from '@/hud/format';
import { fetchBoard } from '@/shootout/leaderboard';
import type { LeaderboardResult } from '@/shootout/model';
import { OFFLINE_MESSAGE, resetsIn, SERVER_DOWN_MESSAGE } from '@/ui/screens/shootout';

const POLL_MS = 30_000;

export class TitleBoard {
  readonly el = h('aside', 'mn-title-board', { 'aria-label': 'Shootout Top 10 this week' });
  private readonly season = h('p', 'mn-title-board__season');
  private readonly status = h('p', 'mn-shootout-status', { role: 'status', 'aria-live': 'polite' });
  private readonly rows = h('tbody');
  private poll: ReturnType<typeof setInterval> | null = null;
  private generation = 0;

  /** `mine` lists this browser's attempt ids, so its own laps stand out. */
  constructor(private readonly mine: () => ReadonlySet<string> = () => new Set()) {
    this.el.append(
      h('header', 'mn-title-board__head', undefined, [
        h('p', 'mn-title-board__eyebrow', undefined, ['Shootout · All cars']),
        h('h2', 'mn-title-board__title', undefined, ['Top 10 this week']),
        this.season,
      ]),
      this.status,
      h('table', 'mn-table', undefined, [
        h('thead', undefined, undefined, [h('tr', undefined, undefined, ['#', 'Driver', 'Car', 'Time'].map(label => h('th', undefined, { scope: 'col' }, [label])))]),
        this.rows,
      ]),
    );
  }

  show(): void {
    this.hide();
    this.status.textContent = 'Connecting to the live leaderboard…';
    this.status.hidden = false;
    void this.refresh();
    this.poll = setInterval(() => { void this.refresh(); }, POLL_MS);
  }

  hide(): void {
    this.generation++;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  private async refresh(): Promise<void> {
    const generation = this.generation;
    let result: LeaderboardResult | null;
    // fetchBoard never throws by contract; a broken build still shows the server-down message.
    try { result = await fetchBoard('all'); } catch { result = null; }
    if (generation !== this.generation) return;
    this.render(result);
  }

  private render(result: LeaderboardResult | null): void {
    this.season.textContent = result ? resetsIn(result.season.endsAt) : '';
    const available = result?.available === true;
    this.el.dataset.available = String(available);
    if (!result || !available) {
      this.status.textContent = result?.unavailable === 'offline' ? OFFLINE_MESSAGE : SERVER_DOWN_MESSAGE;
      this.status.hidden = false;
      this.rows.replaceChildren();
      return;
    }
    this.status.textContent = result.entries.length ? '' : 'No scores yet this week. Set the first time.';
    this.status.hidden = !this.status.textContent;
    const mine = this.mine();
    const filled = result.entries.map(entry => {
      const own = entry.id !== undefined && mine.has(entry.id);
      return h('tr', own ? 'is-mine' : undefined, own ? { 'aria-label': `Your lap, rank ${entry.rank}` } : undefined, [
        h('td', 'mn-title-board__rank', undefined, [String(entry.rank)]),
        h('td', undefined, undefined, [own ? `${entry.nickname} (you)` : entry.nickname]),
        h('td', undefined, undefined, [CAR_SPECS[entry.car].shortName]),
        h('td', 'mn-time', undefined, [formatLapTime(entry.timeS)]),
      ]);
    });
    // Open places keep the board at ten rows: each one is a place to take.
    const open = Array.from({ length: 10 - filled.length }, (_, i) => h('tr', 'is-open', { 'aria-label': `Rank ${filled.length + i + 1} open` }, [
      h('td', 'mn-title-board__rank', undefined, [String(filled.length + i + 1)]),
      h('td', undefined, { colspan: '2' }, ['Open']),
      h('td', 'mn-time', undefined, ['—']),
    ]));
    this.rows.replaceChildren(...filled, ...open);
  }
}
