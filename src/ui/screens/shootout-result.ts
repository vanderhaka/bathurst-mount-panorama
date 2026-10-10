import { h } from '@/hud/dom';
import { formatLapTime } from '@/hud/format';
import type { ShootoutAttempt, ShootoutOutcome } from '@/shootout/model';
import type { ShootoutStore } from '@/shootout/store';
import type { ShootoutMode } from '@/types/session';
import { hintBar, kicker, menuButton, screenEl, STD_HINTS, type Screen } from '@/ui/screen';

interface ResultActions { again(): void; leaderboard(): void; menu(): void }

export class ShootoutResultScreen implements Screen {
  readonly id = 'shootoutResult' as const;
  readonly el = screenEl('shootoutResult', 'Shootout result', 'mn-screen--dim');
  private mode: ShootoutMode = 'shootoutArcade';
  private attempt: ShootoutAttempt | null = null;
  private outcome: ShootoutOutcome | null = null;
  private readonly title = h('h2', 'mn-h2');
  private readonly time = h('p', 'mn-shootout-time');
  private readonly detail = h('p', 'mn-shootout-lead');
  private readonly quota = h('p', 'mn-shootout-quota');
  private readonly status = h('p', 'mn-shootout-status', { role: 'status', 'aria-live': 'polite' });
  private readonly nickname = h('input', 'mn-item mn-shootout-nickname', {
    type: 'text', id: 'shootout-nickname', name: 'nickname', autocomplete: 'nickname', maxlength: 24,
    placeholder: 'Your name or nickname', 'aria-describedby': 'shootout-nickname-note',
  });
  private readonly form = h('form', 'mn-shootout-submit');
  private readonly warning = h('div', 'mn-shootout-warning', { hidden: true, role: 'alert' });
  private readonly submit: HTMLButtonElement;
  private readonly skip: HTMLButtonElement;
  private readonly confirmSkip: HTMLButtonElement;
  private readonly keep: HTMLButtonElement;
  private readonly again: HTMLButtonElement;
  private readonly leaderboard: HTMLButtonElement;
  private readonly menu: HTMLButtonElement;
  private decided = false;
  private busy = false;
  private queued = false;

  constructor(private readonly store: ShootoutStore, private readonly actions: ResultActions) {
    this.submit = menuButton('Submit to leaderboard', () => { void this.publish(); }, { variant: 'primary' });
    this.skip = menuButton('Skip leaderboard', () => this.warnSkip());
    this.confirmSkip = menuButton('Skip this score', () => this.skipScore());
    this.keep = menuButton('Keep my score', () => { this.warning.hidden = true; this.form.hidden = false; this.nickname.focus(); });
    this.again = menuButton('Next warm-up', actions.again, { variant: 'primary' });
    this.leaderboard = menuButton('View Top 10', actions.leaderboard);
    this.menu = menuButton('Main menu', actions.menu);
    this.form.append(h('label', 'mn-shootout-label', { for: 'shootout-nickname' }, ['Claim your lap']), this.nickname,
      h('p', 'mn-shootout-fine', { id: 'shootout-nickname-note' }, ['Your nickname will be public. It is optional, but your lap only counts as a leaderboard score if you submit it.']),
      h('div', 'mn-actions', undefined, [this.submit, this.skip]));
    this.form.addEventListener('submit', event => { event.preventDefault(); void this.publish(); });
    this.warning.append(h('h3', undefined, undefined, ['Leave this lap unrecognised?']),
      h('p', undefined, undefined, ['Without a nickname, this lap will not count as a leaderboard score and you will not get recognition for it. This attempt is still used.']),
      h('div', 'mn-actions', undefined, [this.keep, this.confirmSkip]));
    this.el.append(h('div', 'mn-panel mn-panel--shootout-result', undefined, [
      h('header', 'mn-panel__head', undefined, [kicker('Bathurst Shootout'), this.title]),
      this.time, this.detail, this.quota, this.form, this.warning, this.status,
      h('div', 'mn-actions', undefined, [this.again, this.leaderboard, this.menu]),
    ]), hintBar(STD_HINTS));
  }

  set(mode: ShootoutMode, attempt: ShootoutAttempt | null, outcome: ShootoutOutcome): void {
    this.mode = mode;
    this.attempt = attempt;
    this.outcome = outcome;
    this.decided = mode === 'shootoutArcade' || outcome.kind === 'invalid';
    this.busy = false;
    this.warning.hidden = true;
    this.status.textContent = '';
    this.title.textContent = outcome.kind === 'invalid'
      ? 'Shootout session ended'
      : mode === 'shootoutArcade' ? 'Arcade practice result' : 'Claim your Shootout lap';
    this.time.textContent = outcome.timeS === null ? 'No score' : formatLapTime(outcome.timeS);
    this.time.dataset.valid = String(outcome.kind === 'valid');
    this.detail.textContent = outcome.kind === 'invalid' ? outcome.reason
      : mode === 'shootoutArcade' ? 'Practice time only. No official score and no Top 10 attempt used.' : 'Valid flying lap. Submit your nickname to enter the competition.';
    const snapshot = this.store.snapshot();
    const saved = attempt ? snapshot.attempts.find(a => a.attempt.id === attempt.id) : null;
    this.queued = saved?.publication === 'pending' && saved.nickname !== null;
    if (this.queued) this.status.textContent = 'Your nickname is saved. Retry submission to get this lap onto the leaderboard.';
    this.nickname.value = saved?.nickname ?? snapshot.nickname;
    if (saved?.publication === 'published' || saved?.publication === 'skipped') this.decided = true;
    this.quota.textContent = mode === 'shootoutArcade' ? 'Unlimited practice'
      : attempt ? `Attempt ${attempt.number} of 3 used · ${snapshot.remaining} remaining`
      : `No competition attempt used · ${snapshot.remaining} remaining`;
    this.render();
  }

  showError(message: string): void { this.status.textContent = message; }

  private render(): void {
    this.form.hidden = this.decided || !this.warning.hidden;
    this.submit.disabled = this.busy;
    this.skip.disabled = this.busy;
    this.skip.hidden = this.queued;
    const submitLabel = this.submit.querySelector('.mn-btn__label');
    if (submitLabel) submitLabel.textContent = this.queued ? 'Retry submission' : 'Submit to leaderboard';
    this.nickname.disabled = this.busy;
    this.again.hidden = !this.decided;
    this.menu.hidden = !this.decided && !this.queued;
    this.nickname.readOnly = this.queued;
    this.leaderboard.hidden = !this.decided || this.mode !== 'shootoutTop10';
    this.again.disabled = this.mode === 'shootoutTop10' && this.store.snapshot().remaining === 0;
    const label = this.mode === 'shootoutArcade' ? 'Another warm-up' : this.attempt ? 'Next warm-up' : 'Restart warm-up';
    const text = this.again.querySelector('.mn-btn__label');
    if (text) text.textContent = label;
  }

  private async publish(): Promise<void> {
    if (this.busy || this.decided || !this.attempt) return;
    if (!this.nickname.value.trim()) { this.status.textContent = 'Enter a nickname to submit, or choose Skip leaderboard.'; this.nickname.focus(); return; }
    this.busy = true;
    this.status.textContent = 'Submitting your score…';
    this.render();
    try {
      if (this.outcome) this.store.complete(this.attempt.id, this.outcome);
      const result = await this.store.submit(this.attempt.id, this.nickname.value);
      if (result === 'published') {
        this.decided = true;
        this.status.textContent = 'Score submitted. Your best published lap counts; the board shows the fastest 10 drivers.';
      } else this.status.textContent = 'Saved on this browser. It has not reached the leaderboard yet. Retry now or return to the menu and finish this result later.';
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : 'Your score could not be submitted. Please retry.';
    }
    this.queued = this.store.snapshot().attempts.some(a => a.attempt.id === this.attempt?.id && a.nickname !== null && a.publication === 'pending');
    this.busy = false;
    this.render();
    if (this.decided) (this.again.disabled ? this.leaderboard : this.again).focus();
  }

  private warnSkip(): void {
    if (this.busy || this.decided || this.queued) return;
    this.warning.hidden = false;
    this.render();
    this.keep.focus();
  }

  private skipScore(): void {
    if (this.busy || this.decided || this.queued || !this.attempt) return;
    try {
      if (this.outcome) this.store.complete(this.attempt.id, this.outcome);
      this.store.skip(this.attempt.id);
      this.decided = true;
      this.warning.hidden = true;
      this.status.textContent = 'No leaderboard score was submitted. This attempt is still used.';
      this.render();
      (this.again.disabled ? this.leaderboard : this.again).focus();
    } catch (error) { this.status.textContent = error instanceof Error ? error.message : 'Could not save your choice. Please retry.'; }
  }

  items(): HTMLElement[] {
    const controls = this.warning.hidden ? [this.nickname, this.submit, this.skip] : [this.keep, this.confirmSkip];
    return [...(!this.decided ? controls : []), this.again, this.leaderboard, this.menu].filter(b => !b.hidden && !b.disabled);
  }

  back(): void {
    if (this.busy) return;
    if (this.decided || this.queued) this.actions.menu();
    else if (!this.warning.hidden) { this.warning.hidden = true; this.render(); this.nickname.focus(); }
    else this.warnSkip();
  }
}
