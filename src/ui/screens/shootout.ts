import { CAR_SPECS } from '@/car/car-specs';
import { h } from '@/hud/dom';
import { formatLapTime } from '@/hud/format';
import { fetchBoard } from '@/shootout/leaderboard';
import { type BoardCar, currentSeason, type LeaderboardResult, type SavedShootoutAttempt, type ShootoutSeason } from '@/shootout/model';
import { loadWarmupStart, saveWarmupStart, warmupChoiceUnlocked } from '@/shootout/warmup-start';
import type { ShootoutStore } from '@/shootout/store';
import { ACTIVE_CIRCUIT } from '@/track/circuits';
import type { ShootoutMode } from '@/types/session';
import { hintBar, kicker, menuButton, screenEl, STD_HINTS, type Screen } from '@/ui/screen';

interface ShootoutActions {
  start(): void;
  arcade(): void;
  resume(result: SavedShootoutAttempt): void;
  back(): void;
}

/** Board tabs, in order. */
export const BOARD_TABS: ReadonlyArray<{ car: BoardCar; label: string }> = [
  { car: 'all', label: 'All' }, { car: 'camaro', label: 'Camaro' }, { car: 'mustang', label: 'Mustang' }, { car: 'supra', label: 'Supra' },
];

export const OFFLINE_MESSAGE = "You're offline. Practice in Arcade; Top 10 needs a connection.";
export const SERVER_DOWN_MESSAGE = 'The leaderboard is down right now. Try again soon, or practice in Arcade.';

/** 'Resets in 3d 4h' (hours and minutes in the last day, minutes in the last hour). */
export function resetsIn(endsAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((Date.parse(endsAt) - now) / 60_000));
  if (!Number.isFinite(minutes)) return '';
  const d = Math.floor(minutes / 1440), hrs = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  return `Resets in ${d > 0 ? `${d}d ${hrs}h` : hrs > 0 ? `${hrs}h ${m}m` : `${Math.max(1, m)}m`}`;
}

const startLabel = (grid: boolean) => `Warm-up start: ${grid ? 'Grid' : "Forrest's Elbow"}`;

export class ShootoutScreen implements Screen {
  readonly id = 'shootout' as const;
  readonly el = screenEl('shootout', 'Shootout introduction', 'mn-screen--dim');
  private mode: ShootoutMode = 'shootoutArcade';
  private readonly title = h('h2', 'mn-h2');
  private readonly subtitle = h('p', 'mn-shootout-lead');
  private readonly rules = h('ol', 'mn-shootout-steps');
  private readonly quota = h('p', 'mn-shootout-quota');
  private readonly blocked = h('p', 'mn-shootout-fine mn-shootout-blocked', { role: 'status', hidden: true });
  private readonly history = h('div', 'mn-shootout-history');
  private readonly proRules = h('p', 'mn-shootout-fine', undefined, ['Pro rules: full damage, track limits and tyre wear. Automatic gears, ABS, traction control and steering assist; no racing line. Soft tyres and standard setup. Each lap has a 10-minute limit; reaching it ends the session without a score.']);
  private readonly board = h('section', 'mn-shootout-board');
  private readonly boardTitle = h('h3', 'mn-shootout-board-title');
  private readonly season = h('p', 'mn-shootout-season');
  private readonly boardStatus = h('p', 'mn-shootout-status', { role: 'status', 'aria-live': 'polite' });
  private readonly boardRows = h('tbody');
  private readonly tabs: HTMLButtonElement[];
  private readonly start: HTMLButtonElement;
  private readonly arcade: HTMLButtonElement;
  private readonly resume: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private readonly warmupStart: HTMLButtonElement;
  private boardCar: BoardCar = 'all';
  private available = false;
  /** Why the board is unavailable (offline or server down), once a fetch has said so. */
  private unavailable: string | null = null;
  private seasonInfo: ShootoutSeason | null = null;
  private pending: SavedShootoutAttempt | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private visible = false;
  private generation = 0;

  constructor(private readonly store: ShootoutStore, private readonly actions: ShootoutActions) {
    this.start = menuButton('Choose car', actions.start, { variant: 'primary' });
    this.arcade = menuButton('Practice in Arcade', actions.arcade);
    this.resume = menuButton('Finish last result', () => { if (this.pending) actions.resume(this.pending); });
    this.backBtn = menuButton('Back', actions.back);
    this.warmupStart = menuButton(startLabel(false), () => {
      saveWarmupStart(this.mode, loadWarmupStart(this.mode) === 'grid' ? 'rolling' : 'grid');
      this.render();
    });
    // Car tabs are ordinary focus stops (left / right move between them, Enter picks one); LB / RB cycle them too.
    this.tabs = BOARD_TABS.map(({ car, label }) => {
      const tab = menuButton(label, () => this.selectBoard(car));
      tab.classList.add('mn-shootout-tab');
      tab.setAttribute('role', 'tab');
      tab.setAttribute('data-board-car', car);
      return tab;
    });
    this.board.append(this.boardTitle, this.season,
      h('div', 'mn-shootout-tabs', { role: 'tablist', 'aria-label': 'Leaderboard car' }, this.tabs),
      this.boardStatus,
      h('table', 'mn-table', { 'aria-label': 'Shootout Top 10 this week' }, [
        h('thead', undefined, undefined, [h('tr', undefined, undefined, ['Rank', 'Driver', 'Car', 'Time'].map(label => h('th', undefined, { scope: 'col' }, [label])))]),
        this.boardRows,
      ]), h('p', 'mn-shootout-fine', undefined, ['Fastest published lap per browser this week. Updates every 15 seconds.']));
    this.el.append(h('div', 'mn-panel mn-panel--shootout', undefined, [
      h('header', 'mn-panel__head', undefined, [kicker('Bathurst · Camaro / Mustang / Supra'), this.title, this.subtitle]),
      h('div', 'mn-shootout-columns', undefined, [
        h('section', 'mn-shootout-intro', undefined, [this.rules, this.proRules, this.history]), this.board,
      ]),
      this.quota,
      h('div', 'mn-shootout-actions', undefined, [this.start, this.warmupStart, this.resume, this.arcade, this.backBtn]),
      this.blocked,
    ]), hintBar([...STD_HINTS, ['Q E', 'LB RB', 'Car']]));
  }

  setMode(mode: ShootoutMode): void {
    this.mode = mode;
    this.available = false;
    this.unavailable = null;
    this.render();
  }

  private selectBoard(car: BoardCar): void {
    if (car === this.boardCar) return;
    this.boardCar = car;
    this.generation++;
    this.boardRows.replaceChildren();
    this.boardStatus.textContent = 'Loading…';
    this.renderTabs();
    if (this.visible) void this.refresh();
  }

  private renderTabs(): void {
    for (const tab of this.tabs) {
      const on = tab.dataset.boardCar === this.boardCar;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    const label = BOARD_TABS.find(t => t.car === this.boardCar)?.label ?? 'All';
    this.boardTitle.textContent = this.boardCar === 'all' ? 'Top 10 this week' : `${label} Top 10 this week`;
  }

  private render(): void {
    const top10 = this.mode === 'shootoutTop10';
    this.title.textContent = top10 ? 'Shootout Top 10' : 'Shootout Arcade';
    this.subtitle.textContent = top10 ? 'One flying lap. Three chances a week to make your mark.' : 'Learn the mountain. Chase the fastest lap whenever you like.';
    const unlocked = warmupChoiceUnlocked(this.mode);
    const grid = loadWarmupStart(this.mode) === 'grid';
    this.warmupStart.hidden = !unlocked;
    const startText = this.warmupStart.querySelector('.mn-btn__label');
    if (startText) startText.textContent = startLabel(grid);
    const steps = top10 ? [
      ['Warm up', grid ? 'Start on the grid and drive one full warm-up lap. Quitting or restarting here uses no attempt.'
        : "A rolling start from Forrest's Elbow on warm tyres. Quitting or restarting here uses no attempt."],
      ['Set your time', 'Cross the line to start one full timed lap. That uses one of your three attempts this week, even if you quit or invalidate it.'],
      ['Claim your lap', 'Add a nickname to submit a valid score. Skipping means no recognised leaderboard score; the attempt stays used.'],
    ] : [
      ['Warm up', grid ? 'Start on the grid and drive one full warm-up lap before every run.' : "A rolling start from Forrest's Elbow before every run."],
      ['Chase the ghost', 'One flying lap against the current #1 for your car, or your own best when there is none.'],
      ['Try again', 'Unlimited runs. Arcade never uses a Top 10 attempt or posts an official score.'],
    ];
    this.rules.replaceChildren(...steps.map(([title, copy]) => h('li', undefined, undefined, [h('strong', undefined, undefined, [title]), h('p', undefined, undefined, [copy])])));
    this.arcade.hidden = !top10;
    this.history.hidden = !top10;
    this.resume.hidden = true;
    const snapshot = this.store.snapshot();
    this.seasonInfo ??= snapshot.season ?? null;
    this.renderSeason();
    this.renderTabs();
    this.blocked.hidden = true;
    if (top10) {
      this.pending = snapshot.attempts.find(a => a.outcome?.kind === 'valid' && a.publication === 'pending') ?? null;
      this.quota.textContent = snapshot.writable ? `${snapshot.remaining} of 3 attempts left this week` : 'Competition needs browser storage enabled to track your attempts.';
      this.resume.hidden = !this.pending;
      this.history.replaceChildren(h('p', 'mn-shootout-fine', undefined, ['3 attempts per week on this browser/device, shared across the three cars. No login.']),
        ...snapshot.attempts.map(a => h('p', 'mn-shootout-attempt', undefined, [
          `Attempt ${a.attempt.number} · ${CAR_SPECS[a.attempt.car].shortName} · ${a.outcome?.kind === 'valid' ? formatLapTime(a.outcome.timeS) : a.outcome?.kind === 'invalid' ? 'Invalid lap' : 'Used'} · ${a.publication === 'published' ? 'Submitted' : a.publication === 'skipped' ? 'No score' : a.outcome?.kind === 'valid' ? 'Awaiting nickname' : 'No score'}`,
        ])));
      const reason = snapshot.blockedReason ?? null;
      this.start.disabled = !this.available || !!reason || snapshot.remaining === 0 || !snapshot.writable || this.pending !== null;
      if (this.start.disabled) {
        this.blocked.textContent = reason ?? (this.pending ? 'Finish your last result before a new attempt.'
          : !snapshot.writable ? 'Competition needs browser storage enabled to track your attempts.'
          : snapshot.remaining === 0 ? 'All 3 attempts this week are used. Practice in Arcade until the reset.'
          : this.unavailable ?? 'Connecting to the leaderboard…');
        this.blocked.hidden = !this.blocked.textContent;
      }
    } else {
      this.quota.textContent = 'Unlimited practice · Pro rules · Your best and the #1 ghost per car';
      this.start.disabled = false;
    }
    const label = ACTIVE_CIRCUIT === 'bathurst' ? 'Choose car' : 'Switch to Bathurst';
    const text = this.start.querySelector('.mn-btn__label');
    if (text) text.textContent = label;
  }

  private renderSeason(): void {
    const season = this.seasonInfo ?? (() => { try { return currentSeason(); } catch { return null; } })();
    this.season.textContent = ['This week', season ? resetsIn(season.endsAt) : '', '3 attempts per week'].filter(Boolean).join(' · ');
  }

  private showBoard(result: Omit<LeaderboardResult, 'season'> & { season?: ShootoutSeason }): void {
    this.available = result.available;
    if (result.season) this.seasonInfo = result.season;
    const offline = result.unavailable === 'offline' || (typeof navigator !== 'undefined' && navigator.onLine === false);
    this.unavailable = result.available ? null : offline ? OFFLINE_MESSAGE : SERVER_DOWN_MESSAGE;
    const mine = new Set(this.store.snapshot().attempts.map(a => a.attempt.id));
    this.boardStatus.textContent = this.unavailable
      ?? (result.entries.length ? this.mode === 'shootoutTop10' ? 'Live · The fastest 10 published laps' : 'Live · The laps to beat'
      : 'Live · No scores yet this week. Set the first time.');
    this.board.dataset.available = String(result.available);
    this.boardRows.replaceChildren(...result.entries.map(entry => {
      const own = entry.id !== undefined && mine.has(entry.id);
      const row = h('tr', own ? 'is-mine' : undefined, own ? { 'aria-label': `Your lap, rank ${entry.rank}` } : undefined, [
        String(entry.rank), own ? `${entry.nickname} (you)` : entry.nickname, CAR_SPECS[entry.car].shortName, formatLapTime(entry.timeS),
      ].map(text => h('td', undefined, undefined, [text])));
      return row;
    }));
  }

  private async refresh(): Promise<void> {
    const generation = this.generation;
    let result: Parameters<ShootoutScreen['showBoard']>[0];
    // fetchBoard never throws by contract; a broken build still shows the server-down message.
    try { result = await fetchBoard(this.boardCar); }
    catch { result = { available: false, car: this.boardCar, entries: [], unavailable: 'server' }; }
    if (!this.visible || generation !== this.generation) return;
    this.showBoard(result);
    this.render();
  }

  onShow(): void {
    this.onHide();
    this.visible = true;
    this.generation++;
    this.render();
    const columns = this.el.querySelector('.mn-shootout-columns');
    if (columns) columns.scrollTop = 0;
    this.boardStatus.textContent = 'Connecting to the live leaderboard…';
    void this.refresh();
    this.poll = setInterval(() => { void this.refresh(); }, 15_000);
  }

  onHide(): void {
    this.visible = false;
    this.generation++;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  /** LB / RB: the next car board. */
  tab(dir: -1 | 1): void {
    const i = BOARD_TABS.findIndex(t => t.car === this.boardCar);
    this.selectBoard(BOARD_TABS[(i + dir + BOARD_TABS.length) % BOARD_TABS.length].car);
  }

  items(): HTMLElement[] {
    return [this.start, this.warmupStart, this.resume, this.arcade, this.backBtn, ...this.tabs].filter(b => !b.hidden && !b.disabled);
  }
  back(): void { this.actions.back(); }
}
