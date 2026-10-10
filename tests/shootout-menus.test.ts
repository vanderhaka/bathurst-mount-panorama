// Shootout menus on the DOM stand-in: the intro board (car tabs, season, own rows, outages), the result screen
// (rank, refused publication, Arcade best) and the pause menu during a run. src/shootout is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeaderboardResult, SavedShootoutAttempt, ShootoutAttempt, ShootoutSeason } from '@/shootout/model';
import type { MenuCallbacks, Menus } from '@/types/hud';
import { DEFAULT_SETTINGS } from '@/types/session';
import { findText, stubMenuDom, type MenuNode } from './menu-dom-fixture';

const NOW = Date.parse('2026-10-15T09:00:00+11:00');
const season: ShootoutSeason = { id: '2026-10-12', startsAt: '2026-10-11T13:00:00Z', endsAt: new Date(NOW + (3 * 24 + 4) * 3600_000 + 60_000).toISOString() };
const attempt: ShootoutAttempt = { id: '7cc474ed-5235-4b3c-8e98-c331bd097a0d', number: 1, car: 'camaro', online: true, startedAt: '2026-10-13T00:00:00Z' };

const store = vi.hoisted(() => ({
  snapshot: vi.fn(), submit: vi.fn(), complete: vi.fn(), skip: vi.fn(), rankOf: vi.fn(), publishError: vi.fn(),
}));
const board = vi.hoisted(() => ({ fetchBoard: vi.fn(), fetchReplay: vi.fn() }));
vi.mock('@/shootout/store', () => ({ ShootoutStore: class { constructor() { return store; } } }));
vi.mock('@/shootout/leaderboard', () => board);
vi.mock('@/shootout/model', async (load) => ({ ...await load<typeof import('@/shootout/model')>(), currentSeason: () => season }));

type Field = MenuNode & { value: string; readOnly: boolean };
let menus: Menus | null = null;
let restarts = 0;
let saved: SavedShootoutAttempt[] = [];
let blockedReason: string | null = null;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(NOW);
  saved = []; blockedReason = null; restarts = 0;
  for (const fn of [...Object.values(store), ...Object.values(board)]) fn.mockReset();
  store.snapshot.mockImplementation(() => ({ remaining: 3 - saved.length, attempts: saved, nickname: '', writable: true, season, blockedReason }));
  board.fetchBoard.mockImplementation(async (car: string): Promise<LeaderboardResult> => ({ available: true, season, car: car as 'all', entries: [] }));
});
afterEach(() => { menus?.dispose(); menus = null; vi.useRealTimers(); vi.unstubAllGlobals(); });

async function open() {
  const doc = stubMenuDom();
  vi.stubGlobal('navigator', { maxTouchPoints: 0, onLine: true });
  vi.stubGlobal('location', { search: '' });
  const { createMenus } = await import('@/ui');
  const callbacks: MenuCallbacks = {
    onStart() {}, onResume() {}, onRestart: () => { restarts++; }, onResetCar() {}, onToggleTuner() {},
    onQuitToMenu() {}, onSettingsChange() {}, onPreviewCar() {},
  };
  menus = createMenus();
  menus.mount(doc.body as unknown as HTMLElement, callbacks, DEFAULT_SETTINGS);
  const screen = (id: string): MenuNode => doc.body.querySelectorAll('.mn-screen').find((el) => el.className.includes(`mn-screen--${id}`))!;
  /** The button whose label reads `text`. */
  const label = (root: MenuNode, text: string) => findText(root, text)!.parent! as MenuNode & { disabled?: boolean };
  const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
  return { doc, menus, screen, label, settle };
}

describe('Shootout intro board', () => {
  it('shows the board in Arcade too, with car tabs that load each car\'s board', async () => {
    const { menus, screen, settle } = await open();
    menus.showShootout('shootoutArcade');
    await settle();
    const intro = screen('shootout');
    expect(intro.querySelector('.mn-shootout-board')!.hidden).toBe(false);
    expect(board.fetchBoard).toHaveBeenLastCalledWith('all');
    const tabs = intro.querySelectorAll('.mn-shootout-tab');
    expect(tabs.map((t) => t.textContent)).toEqual(['All', 'Camaro', 'Mustang', 'Supra']);
    tabs[2].click();
    await settle();
    expect(board.fetchBoard).toHaveBeenLastCalledWith('mustang');
    expect(intro.querySelector('.mn-shootout-board-title')!.textContent).toBe('Mustang Top 10 this week');
    expect(tabs[2].attributes['aria-selected']).toBe('true');
    menus.nav('nextTab');
    await settle();
    expect(board.fetchBoard).toHaveBeenLastCalledWith('supra');
  });

  it('puts the tabs in the keyboard / gamepad focus order', async () => {
    const { doc, menus, screen, settle } = await open();
    menus.showShootout('shootoutTop10');
    await settle();
    const tabs = screen('shootout').querySelectorAll('.mn-shootout-tab');
    for (let i = 0; i < 10 && doc.activeElement !== tabs[0]; i++) menus.nav('down');
    expect(doc.activeElement).toBe(tabs[0]);
    menus.nav('down');
    expect(doc.activeElement).toBe(tabs[1]);
    menus.nav('accept');
    await settle();
    expect(board.fetchBoard).toHaveBeenLastCalledWith('camaro');
  });

  it('highlights the player\'s own laps and shows the season and weekly quota', async () => {
    saved = [{ attempt, outcome: { kind: 'valid', timeS: 125, sectorsS: [50, 40, 35] }, nickname: 'Me', publication: 'published' }];
    board.fetchBoard.mockResolvedValue({ available: true, season, car: 'all', entries: [
      { rank: 1, nickname: 'Fast', car: 'supra', timeS: 123, id: 'other' },
      { rank: 2, nickname: 'Me', car: 'camaro', timeS: 125, id: attempt.id },
    ] });
    const { menus, screen, settle } = await open();
    menus.showShootout('shootoutTop10');
    await settle();
    const intro = screen('shootout');
    const rows = intro.querySelectorAll('tr').slice(1);
    expect(rows.map((r) => r.classList.contains('is-mine'))).toEqual([false, true]);
    expect(rows[1].textContent).toContain('Me (you)');
    expect(intro.querySelector('.mn-shootout-season')!.textContent).toBe('This week · Resets in 3d 4h · 3 attempts per week');
    expect(intro.querySelector('.mn-shootout-quota')!.textContent).toBe('2 of 3 attempts left this week');
  });

  it.each([
    ['offline', "You're offline. Practice in Arcade; Top 10 needs a connection."],
    ['server', 'The leaderboard is down right now. Try again soon, or practice in Arcade.'],
  ] as const)('says why the board is unavailable (%s) and keeps Start disabled', async (unavailable, message) => {
    board.fetchBoard.mockResolvedValue({ available: false, season, car: 'all', entries: [], unavailable });
    const { menus, screen, label, settle } = await open();
    menus.showShootout('shootoutTop10');
    await settle();
    const intro = screen('shootout');
    expect(intro.querySelector('.mn-shootout-status')!.textContent).toBe(message);
    expect(label(intro, 'Choose car').disabled).toBe(true);
    expect(intro.querySelector('.mn-shootout-blocked')!.textContent).toBe(message);
    expect(intro.textContent).not.toContain('not connected');
  });

  it('shows the store\'s reason under a disabled Start', async () => {
    blockedReason = 'All 3 attempts this week are used. Next attempts on Monday.';
    const { menus, screen, label, settle } = await open();
    menus.showShootout('shootoutTop10');
    await settle();
    const intro = screen('shootout');
    expect(label(intro, 'Choose car').disabled).toBe(true);
    const blocked = intro.querySelector('.mn-shootout-blocked')!;
    expect(blocked.hidden).toBe(false);
    expect(blocked.textContent).toBe(blockedReason);
  });

  it('counts down to the weekly reset', async () => {
    const { resetsIn } = await import('@/ui/screens/shootout');
    expect(resetsIn('2026-10-19T00:00:00Z', Date.parse('2026-10-15T20:00:00Z'))).toBe('Resets in 3d 4h');
    expect(resetsIn('2026-10-19T00:00:00Z', Date.parse('2026-10-18T18:30:00Z'))).toBe('Resets in 5h 30m');
    expect(resetsIn('2026-10-19T00:00:00Z', Date.parse('2026-10-18T23:59:50Z'))).toBe('Resets in 1m');
  });
});

describe('Shootout result', () => {
  const valid = { kind: 'valid' as const, timeS: 125, sectorsS: [50, 40, 35] };

  it('shows the weekly rank after publishing', async () => {
    saved = [{ attempt, outcome: valid, nickname: null, publication: 'pending' }];
    store.submit.mockResolvedValue('published');
    store.rankOf.mockReturnValue({ rank: 14, of: 230 });
    const { menus, screen, label, settle } = await open();
    menus.showShootoutResult('shootoutTop10', attempt, valid);
    const result = screen('shootoutResult');
    (result.querySelector('input') as Field).value = 'Me';
    label(result, 'Submit to leaderboard').click();
    await settle();
    expect(store.rankOf).toHaveBeenCalledWith(attempt.id);
    expect(result.querySelector('.mn-shootout-standing')!.textContent).toBe("You're #14 of 230 this week");
  });

  it('after a refused publication shows why, and lets the player edit the nickname or skip', async () => {
    saved = [{ attempt, outcome: valid, nickname: null, publication: 'pending' }];
    store.submit.mockImplementation(async () => { saved = [{ ...saved[0], nickname: 'Rude' }]; throw new Error('Rejected'); });
    store.publishError.mockReturnValue('That nickname is not allowed. Choose another.');
    const { menus, screen, label, settle } = await open();
    menus.showShootoutResult('shootoutTop10', attempt, valid);
    const result = screen('shootoutResult');
    const input = result.querySelector('input') as Field;
    input.value = 'Rude';
    label(result, 'Submit to leaderboard').click();
    await settle();
    expect(result.querySelector('.mn-shootout-status')!.textContent).toBe('That nickname is not allowed. Choose another.');
    expect(input.readOnly).toBe(false);
    expect(label(result, 'Skip leaderboard').hidden).toBe(false);
    expect(findText(result, 'Submit to leaderboard')).not.toBeNull();
  });

  it('says plainly that an invalid lap is not on the leaderboard, and why', async () => {
    const invalid = { kind: 'invalid' as const, timeS: 131.2, reason: 'Track limits at The Chase: all four wheels left the track.' };
    saved = [{ attempt, outcome: invalid, nickname: null, publication: 'pending' }];
    const { menus, screen } = await open();
    menus.showShootoutResult('shootoutTop10', attempt, invalid);
    const result = screen('shootoutResult');
    const verdict = result.querySelector('.mn-shootout-verdict')!;
    expect(result.querySelector('h2')!.textContent).toBe('Invalid lap');
    expect(verdict.hidden).toBe(false);
    expect(verdict.textContent).toBe('Not on the leaderboard');
    expect(result.querySelector('.mn-shootout-lead')!.textContent).toBe(invalid.reason);
    expect(result.querySelector('.mn-shootout-time')!.dataset.valid).toBe('false');
    menus.showShootoutResult('shootoutTop10', attempt, valid);
    expect(verdict.hidden).toBe(true);
  });

  it('shows an Arcade lap against the player\'s Arcade best', async () => {
    const { practiceLine } = await import('@/ui/screens/shootout-result');
    expect(practiceLine({ bestS: 124, deltaS: 1.25, improved: false })).toBe('+1.250 to your Arcade best 2:04.000');
    expect(practiceLine({ bestS: 123, deltaS: -0.5, improved: true })).toBe('New Arcade best · -0.500 on your previous best');
    expect(practiceLine({ bestS: 123, deltaS: null, improved: true })).toBe('First Arcade best for this car: 2:03.000');
    const { menus, screen } = await open();
    menus.showShootoutResult('shootoutArcade', null, valid, undefined, { bestS: 124, deltaS: 1, improved: false });
    expect(screen('shootoutResult').querySelector('.mn-shootout-standing')!.textContent).toBe('+1.000 to your Arcade best 2:04.000');
  });
});

describe('Shootout pause menu', () => {
  it('relabels the reset as Back to the start in the warm-up', async () => {
    const { menus, screen, label } = await open();
    menus.showPause({ mode: 'shootoutTop10', timed: false });
    const reset = label(screen('pause'), 'Back to the start');
    expect(reset.hidden).toBe(false);
    expect(reset.attributes['aria-label']).toContain('restarts the warm-up');
    expect(findText(screen('pause'), 'Restart warm-up')).not.toBeNull();
  });

  it('hides the reset in a timed lap and ends the attempt only on a second press within 3 s', async () => {
    const { menus, screen, label } = await open();
    menus.showPause({ mode: 'shootoutTop10', timed: true });
    const pause = screen('pause');
    expect(label(pause, 'Back to the start').hidden).toBe(true);
    const end = label(pause, 'End this attempt');
    expect(end.attributes['aria-label']).toContain('press twice');
    end.click();
    expect(restarts).toBe(0);
    expect(end.textContent).toBe('Press again to end');
    vi.advanceTimersByTime(3100);
    expect(end.textContent).toBe('End this attempt');
    end.click();
    expect(restarts).toBe(0);
    end.click();
    expect(restarts).toBe(1);
  });

  it('keeps one press for an Arcade lap and the plain labels outside the Shootout', async () => {
    const { menus, screen, label } = await open();
    menus.showPause({ mode: 'shootoutArcade', timed: true });
    label(screen('pause'), 'End this lap').click();
    expect(restarts).toBe(1);
    menus.showPause();
    expect(findText(screen('pause'), 'Reset to track')).not.toBeNull();
    expect(findText(screen('pause'), 'Restart')).not.toBeNull();
  });
});

describe('Title screen Top 10', () => {
  it('shows the all-car board with the player\'s own lap and open places to rank 10', async () => {
    saved = [{ attempt, outcome: { kind: 'valid', timeS: 125, sectorsS: [50, 40, 35] }, nickname: 'Me', publication: 'published' }];
    board.fetchBoard.mockResolvedValue({ available: true, season, car: 'all', entries: [
      { rank: 1, nickname: 'Fast', car: 'supra', timeS: 123, id: 'other' },
      { rank: 2, nickname: 'Me', car: 'camaro', timeS: 125, id: attempt.id },
    ] });
    const { menus, screen, settle } = await open();
    menus.showTitle();
    await settle();
    const title = screen('title').querySelector('.mn-title-board')!;
    expect(board.fetchBoard).toHaveBeenLastCalledWith('all');
    const rows = title.querySelectorAll('tr').slice(1);
    expect(rows).toHaveLength(10);
    expect(rows.map((r) => r.classList.contains('is-mine')).slice(0, 2)).toEqual([false, true]);
    expect(rows[1].textContent).toContain('Me (you)');
    expect(rows.slice(2).every((r) => r.classList.contains('is-open'))).toBe(true);
    expect(title.querySelector('.mn-title-board__season')!.textContent).toBe('Resets in 3d 4h');
  });

  it('says why the board is unavailable, refreshes every 30 s and stops when the title closes', async () => {
    board.fetchBoard.mockResolvedValue({ available: false, season, car: 'all', entries: [], unavailable: 'offline' });
    const { menus, screen, settle } = await open();
    menus.showTitle();
    await settle();
    const title = screen('title').querySelector('.mn-title-board')!;
    expect(title.querySelector('.mn-shootout-status')!.textContent).toBe("You're offline. Practice in Arcade; Top 10 needs a connection.");
    expect(title.dataset.available).toBe('false');
    board.fetchBoard.mockClear();
    vi.advanceTimersByTime(30_000);
    expect(board.fetchBoard).toHaveBeenCalledTimes(1);
    menus.showCarSelect();
    board.fetchBoard.mockClear();
    vi.advanceTimersByTime(90_000);
    expect(board.fetchBoard).not.toHaveBeenCalled();
  });
});

describe('Shootout warm-up start toggle', () => {
  const valid = { kind: 'valid' as const, timeS: 125, sectorsS: [50, 40, 35] };
  const mem = new Map<string, string>();
  beforeEach(() => {
    mem.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => mem.set(k, v) });
  });
  const KEY = (mode: string) => `bathurst.shootout.warmupStart.v2.${mode}`;

  it('shows the grid on the intro from the first visit, then flips and persists', async () => {
    const { menus, screen, label, settle } = await open();
    menus.showShootout('shootoutArcade');
    await settle();
    const intro = screen('shootout');
    const toggle = label(intro, 'Warm-up start: Grid');
    expect(toggle.hidden).toBe(false);
    expect(findText(intro, 'Start on the grid and drive one full warm-up lap before every run.')).not.toBeNull();
    toggle.click();
    expect(mem.get(KEY('shootoutArcade'))).toBe('rolling');
    expect(findText(intro, "Warm-up start: Forrest's Elbow")).not.toBeNull();
    label(intro, "Warm-up start: Forrest's Elbow").click();
    expect(mem.get(KEY('shootoutArcade'))).toBe('grid');
  });

  it('appears on the very first result, and persists there', async () => {
    const { menus, screen, label } = await open();
    menus.showShootoutResult('shootoutArcade', null, valid);
    const result = screen('shootoutResult');
    const toggle = label(result, 'Warm-up start: Grid');
    expect(toggle.hidden).toBe(false);
    toggle.click();
    expect(mem.get(KEY('shootoutArcade'))).toBe('rolling');
    expect(findText(result, "Warm-up start: Forrest's Elbow")).not.toBeNull();
  });

  it('stays hidden on the result while the Top 10 score is undecided', async () => {
    saved = [{ attempt, outcome: valid, nickname: null, publication: 'pending' }];
    const { menus, screen, label } = await open();
    menus.showShootoutResult('shootoutTop10', attempt, valid);
    expect(label(screen('shootoutResult'), 'Warm-up start: Grid').hidden).toBe(true);
  });

  it('tells the pause menu where the warm-up restarts', async () => {
    const { menus, screen, label } = await open();
    menus.showPause({ mode: 'shootoutTop10', timed: false, grid: true });
    expect(label(screen('pause'), 'Back to the start').attributes['aria-label']).toContain('on the grid');
  });
});
