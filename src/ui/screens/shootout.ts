import { CAR_SPECS } from '@/car/car-specs';
import { h } from '@/hud/dom';
import { formatLapTime } from '@/hud/format';
import { fetchLeaderboard } from '@/shootout/leaderboard';
import type { SavedShootoutAttempt } from '@/shootout/model';
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

export class ShootoutScreen implements Screen {
  readonly id = 'shootout' as const;
  readonly el = screenEl('shootout', 'Shootout introduction', 'mn-screen--dim');
  private mode: ShootoutMode = 'shootoutArcade';
  private readonly title = h('h2', 'mn-h2');
  private readonly subtitle = h('p', 'mn-shootout-lead');
  private readonly rules = h('ol', 'mn-shootout-steps');
  private readonly quota = h('p', 'mn-shootout-quota');
  private readonly history = h('div', 'mn-shootout-history');
  private readonly proRules = h('p', 'mn-shootout-fine', undefined, ['Pro rules: full damage, track limits and tyre wear. Automatic gears, no racing line or driving assists. Soft tyres and standard setup. Each lap has a 10-minute limit; reaching it ends the session without a score.']);
  private readonly board = h('section', 'mn-shootout-board');
  private readonly boardStatus = h('p', 'mn-shootout-status', { role: 'status', 'aria-live': 'polite' });
  private readonly boardRows = h('tbody');
  private readonly start: HTMLButtonElement;
  private readonly arcade: HTMLButtonElement;
  private readonly resume: HTMLButtonElement;
  private readonly backBtn: HTMLButtonElement;
  private available = false;
  private pending: SavedShootoutAttempt | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  private visible = false;
  private generation = 0;

  constructor(private readonly store: ShootoutStore, private readonly actions: ShootoutActions) {
    this.start = menuButton('Choose car', actions.start, { variant: 'primary' });
    this.arcade = menuButton('Practice in Arcade', actions.arcade);
    this.resume = menuButton('Finish last result', () => { if (this.pending) actions.resume(this.pending); });
    this.backBtn = menuButton('Back', actions.back);
    this.board.append(h('h3', 'mn-shootout-board-title', undefined, ['Global Top 10']), this.boardStatus,
      h('table', 'mn-table', { 'aria-label': 'Global Shootout Top 10' }, [
        h('thead', undefined, undefined, [h('tr', undefined, undefined, ['Rank', 'Driver', 'Car', 'Time'].map(label => h('th', undefined, { scope: 'col' }, [label])))]),
        this.boardRows,
      ]), h('p', 'mn-shootout-fine', undefined, ['Fastest published lap per browser. Updates every 15 seconds.']));
    this.el.append(h('div', 'mn-panel mn-panel--shootout', undefined, [
      h('header', 'mn-panel__head', undefined, [kicker('Bathurst · Camaro / Mustang / Supra'), this.title, this.subtitle]),
      h('div', 'mn-shootout-columns', undefined, [
        h('section', 'mn-shootout-intro', undefined, [this.rules, this.proRules, this.history]), this.board,
      ]),
      this.quota,
      h('div', 'mn-shootout-actions', undefined, [this.start, this.resume, this.arcade, this.backBtn]),
    ]), hintBar(STD_HINTS));
  }

  setMode(mode: ShootoutMode): void {
    this.mode = mode;
    this.available = false;
    this.render();
  }

  private render(): void {
    const top10 = this.mode === 'shootoutTop10';
    this.title.textContent = top10 ? 'Shootout Top 10' : 'Shootout Arcade';
    this.subtitle.textContent = top10 ? 'One flying lap. Three chances to make your mark.' : 'Learn the mountain. Take another run whenever you like.';
    const steps = top10 ? [
      ['Warm up', 'Drive one full warm-up lap. Quitting or restarting here uses no attempt.'],
      ['Set your time', 'Cross the line to start one timed lap. That uses one of your three attempts, even if you quit or invalidate it.'],
      ['Claim your lap', 'Add a nickname to submit a valid score. Skipping means no recognised leaderboard score; the attempt stays used.'],
    ] : [
      ['Warm up', 'Drive one warm-up lap before every run.'],
      ['Go for a time', 'You get one flying lap, then your practice result.'],
      ['Try again', 'Unlimited runs. Arcade never uses a Top 10 attempt or posts an official score.'],
    ];
    this.rules.replaceChildren(...steps.map(([title, copy]) => h('li', undefined, undefined, [h('strong', undefined, undefined, [title]), h('p', undefined, undefined, [copy])])));
    this.board.hidden = !top10;
    this.arcade.hidden = !top10;
    this.history.hidden = !top10;
    this.resume.hidden = true;
    this.quota.textContent = top10 ? 'Checking attempts…' : 'Unlimited practice · Pro rules';
    if (top10) {
      const snapshot = this.store.snapshot();
      this.pending = snapshot.attempts.find(a => a.outcome?.kind === 'valid' && a.publication === 'pending') ?? null;
      this.quota.textContent = snapshot.writable ? `${snapshot.remaining} of 3 competition attempts remaining` : 'Competition needs browser storage enabled to track your attempts.';
      this.resume.hidden = !this.pending;
      this.history.replaceChildren(h('p', 'mn-shootout-fine', undefined, ['Three total attempts on this browser/device, shared across the three cars. No login.']),
        ...snapshot.attempts.map(a => h('p', 'mn-shootout-attempt', undefined, [
          `Attempt ${a.attempt.number} · ${CAR_SPECS[a.attempt.car].shortName} · ${a.outcome?.kind === 'valid' ? formatLapTime(a.outcome.timeS) : a.outcome?.kind === 'invalid' ? 'Invalid lap' : 'Used'} · ${a.publication === 'published' ? 'Submitted' : a.publication === 'skipped' ? 'No score' : a.outcome?.kind === 'valid' ? 'Awaiting nickname' : 'No score'}`,
        ])));
      this.start.disabled = !this.available || snapshot.remaining === 0 || !snapshot.writable || this.pending !== null;
    } else this.start.disabled = false;
    const label = ACTIVE_CIRCUIT === 'bathurst' ? 'Choose car' : 'Switch to Bathurst';
    const text = this.start.querySelector('.mn-btn__label');
    if (text) text.textContent = label;
  }

  private async refresh(): Promise<void> {
    const generation = this.generation;
    try {
      const result = await fetchLeaderboard();
      if (!this.visible || generation !== this.generation) return;
      this.available = result.available;
      this.boardStatus.textContent = !result.available
        ? 'Competition is not connected yet. You can practice in Arcade.'
        : result.entries.length ? 'Live · The fastest 10 published laps' : 'Live · No scores yet. Set the first time.';
      this.board.dataset.available = String(result.available);
      this.boardRows.replaceChildren(...result.entries.map(entry => h('tr', undefined, undefined, [
        String(entry.rank), entry.nickname, CAR_SPECS[entry.car].shortName, formatLapTime(entry.timeS),
      ].map(text => h('td', undefined, undefined, [text])))));
    } catch {
      if (!this.visible || generation !== this.generation) return;
      this.available = false;
      this.boardStatus.textContent = 'The leaderboard is unavailable. Check your connection or practice in Arcade.';
    }
    this.render();
  }

  onShow(): void {
    this.onHide();
    this.visible = true;
    this.generation++;
    this.render();
    const columns = this.el.querySelector('.mn-shootout-columns');
    if (columns) columns.scrollTop = 0;
    if (this.mode === 'shootoutTop10') {
      this.boardStatus.textContent = 'Connecting to the live leaderboard…';
      void this.refresh();
      this.poll = setInterval(() => { void this.refresh(); }, 15_000);
    }
  }

  onHide(): void {
    this.visible = false;
    this.generation++;
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  }

  items(): HTMLElement[] { return [this.start, this.resume, this.arcade, this.backBtn].filter(b => !b.hidden && !b.disabled); }
  back(): void { this.actions.back(); }
}
