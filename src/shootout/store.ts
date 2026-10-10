import {
  type ShootoutRank, type ShootoutSeason,
  currentSeason, decodeReplay, isSeasonId, isShootoutAttempt, isShootoutCar, isShootoutOutcome, isUuid,
  MAX_REPLAY_CHARS, MAX_SHOOTOUT_ATTEMPTS, MAX_SHOOTOUT_LAP_S, MAX_SHOOTOUT_NICKNAME_LENGTH, normalizeShootoutNickname, shootoutNicknameError,
  type SavedShootoutAttempt, type ShootoutAttempt, type ShootoutCar, type ShootoutOutcome,
} from './model';
import { isShootoutRank, publishShootoutAttempt, ShootoutGatewayError, startShootoutAttempt } from './leaderboard';

// The storage key keeps its name; the ledger inside it is version 2 (attempts carry their season).
const LEDGER_KEY = 'bathurst.shootout.v1';
const NICKNAME_KEY = `${LEDGER_KEY}.nickname`;
const RESULT_KEY = (id: string) => `${LEDGER_KEY}.result.${id}`;
const PENDING_START_KEY = (id: string) => `${LEDGER_KEY}.start.${id}`;
const REPLAY_KEY = (id: string) => `${LEDGER_KEY}.replay.${id}`;
const RANK_KEY = (id: string) => `${LEDGER_KEY}.rank.${id}`;
const ERROR_KEY = (id: string) => `${LEDGER_KEY}.error.${id}`;
const ATTEMPT_KEYS = [RESULT_KEY, PENDING_START_KEY, REPLAY_KEY, RANK_KEY, ERROR_KEY];
const LOCK_KEY = `${LEDGER_KEY}.start`;
const MAX_LEDGER_ATTEMPTS = 60;
// The server only verifies a lap whose start it saw within 20 s, so background retries stop after 15 s.
const ALLOCATION_RETRY_MS = [2000, 4000, 8000];
const ALLOCATION_WINDOW_MS = 15_000;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const BLOCKED = "Browser storage is full or blocked, so Shootout attempts can't be saved.";
const CORRUPT = 'Saved Shootout data is corrupt, so competition attempts are off in this browser.';
const AWAITING_NAME = 'Add a nickname to your last valid lap, or skip it, before starting another.';

interface LedgerAttempt extends ShootoutAttempt {
  season: string;
}

interface Ledger {
  version: 2;
  browserToken: string;
  attempts: LedgerAttempt[];
}

export interface ShootoutSnapshot {
  remaining: number;
  attempts: SavedShootoutAttempt[];
  nickname: string;
  writable: boolean;
  /** Contract: this season (attempts and remaining count only this season's). */
  season?: ShootoutSeason;
  /** Contract: why a new Top 10 attempt cannot start right now, for the screen to show; null when it can. */
  blockedReason?: string | null;
}

export interface ShootoutStoreOptions {
  /** Waits between background allocation retries (tests pass []). */
  allocationRetryMs?: readonly number[];
}

const plain = ({ id, number, car, online, startedAt }: ShootoutAttempt): ShootoutAttempt => ({ id, number, car, online, startedAt });
const offline = () => typeof navigator === 'undefined' || navigator.onLine === false;

function hasUniqueIds(attempts: ShootoutAttempt[]): boolean {
  return new Set(attempts.map((attempt) => attempt.id)).size === attempts.length;
}

function isLedgerV1(value: unknown): value is { version: 1; browserToken: string; attempts: ShootoutAttempt[] } {
  return typeof value === 'object' && value !== null && 'version' in value && value.version === 1 &&
    'browserToken' in value && isUuid(value.browserToken) && 'attempts' in value && Array.isArray(value.attempts) &&
    value.attempts.length <= MAX_SHOOTOUT_ATTEMPTS && value.attempts.every(isShootoutAttempt) &&
    value.attempts.every((attempt: ShootoutAttempt, index: number) => attempt.number === index + 1) && hasUniqueIds(value.attempts);
}

function isLedger(value: unknown): value is Ledger {
  if (typeof value !== 'object' || value === null || !('version' in value) || value.version !== 2 ||
    !('browserToken' in value) || !isUuid(value.browserToken) || !('attempts' in value) || !Array.isArray(value.attempts) ||
    value.attempts.length > MAX_LEDGER_ATTEMPTS || !hasUniqueIds(value.attempts)) return false;
  const numbers = new Set<string>();
  for (const attempt of value.attempts as unknown[]) {
    if (!isShootoutAttempt(attempt) || !('season' in attempt) || !isSeasonId(attempt.season)) return false;
    const key = `${attempt.season}/${attempt.number}`;
    if (numbers.has(key)) return false;
    numbers.add(key);
  }
  return true;
}

/** Results saved before the lap floors rose (or with nicknames from before the stricter rules) stay readable, so
 * they never disable the browser; the leaderboard decides on submit. */
function isStoredOutcome(value: unknown): value is ShootoutOutcome {
  return isShootoutOutcome(value) || typeof value === 'object' && value !== null && 'kind' in value && value.kind === 'valid' &&
    'timeS' in value && typeof value.timeS === 'number' && value.timeS >= 100 && value.timeS <= MAX_SHOOTOUT_LAP_S &&
    'sectorsS' in value && Array.isArray(value.sectorsS) && value.sectorsS.length === 3 &&
    value.sectorsS.every((sector: unknown) => typeof sector === 'number' && Number.isFinite(sector) && sector > 0);
}

function isStoredNickname(value: unknown): value is string {
  return typeof value === 'string' && (normalizeShootoutNickname(value) === value ||
    value === value.trim() && value.length > 0 && [...value].length <= MAX_SHOOTOUT_NICKNAME_LENGTH && !/[\u0000-\u001f\u007f]/.test(value));
}

function parseSaved(value: unknown, attempt: ShootoutAttempt): SavedShootoutAttempt {
  if (typeof value !== 'object' || value === null || !('attempt' in value) || !isShootoutAttempt(value.attempt) ||
    value.attempt.id !== attempt.id || value.attempt.number !== attempt.number || value.attempt.car !== attempt.car ||
    !('outcome' in value) || value.outcome !== null && !isStoredOutcome(value.outcome) ||
    !('nickname' in value) || value.nickname !== null && !isStoredNickname(value.nickname) ||
    !('publication' in value) || value.publication !== 'pending' && value.publication !== 'published' && value.publication !== 'skipped' ||
    value.publication === 'published' && (value.outcome === null || value.outcome.kind !== 'valid' || value.nickname === null || !attempt.online)) {
    throw new Error(CORRUPT);
  }
  return { attempt, outcome: value.outcome, nickname: value.nickname, publication: value.publication };
}

/** e.g. 'Monday 12 October' for the season after this one. */
function resetDay(season: ShootoutSeason): string {
  const next = new Date(Date.parse(`${season.id}T00:00:00Z`) + 7 * 86_400_000);
  return `Monday ${next.getUTCDate()} ${MONTHS[next.getUTCMonth()]}`;
}

export class ShootoutStore {
  constructor(private readonly options: ShootoutStoreOptions = {}) {}

  private storage(): Storage {
    try { return localStorage; } catch { throw new Error(BLOCKED); }
  }

  private read(key: string): string | null {
    try { return this.storage().getItem(key); } catch { throw new Error(BLOCKED); }
  }

  private write(key: string, value: unknown): void {
    try { this.storage().setItem(key, JSON.stringify(value)); } catch { throw new Error(BLOCKED); }
  }

  private remove(key: string): void {
    try { this.storage().removeItem(key); } catch { throw new Error(BLOCKED); }
  }

  private readLedger(): Ledger | null {
    const raw = this.read(LEDGER_KEY);
    if (raw === null) return null;
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new Error(CORRUPT); }
    if (isLedger(data)) return data;
    // A version 1 ledger counted three attempts in total; each of its attempts belongs to the season it started in.
    if (isLedgerV1(data)) {
      return { version: 2, browserToken: data.browserToken,
        attempts: data.attempts.map((attempt) => ({ ...plain(attempt), season: currentSeason(new Date(attempt.startedAt)).id })) };
    }
    throw new Error(CORRUPT);
  }

  private readSaved(attempt: ShootoutAttempt): SavedShootoutAttempt {
    const raw = this.read(RESULT_KEY(attempt.id));
    if (raw === null) return { attempt, outcome: null, nickname: null, publication: 'pending' };
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new Error(CORRUPT); }
    return parseSaved(data, attempt);
  }

  private pendingStart(id: string): boolean {
    const raw = this.read(PENDING_START_KEY(id));
    if (raw !== null && raw !== 'true') throw new Error(CORRUPT);
    return raw === 'true';
  }

  private saved(id: string): { ledger: Ledger; entry: LedgerAttempt; saved: SavedShootoutAttempt } {
    const ledger = this.readLedger();
    const entry = ledger?.attempts.find((candidate) => candidate.id === id);
    if (!ledger || !entry) throw new Error('This Shootout attempt was not saved in this browser.');
    return { ledger, entry, saved: this.readSaved(plain(entry)) };
  }

  private replaceInLedger(id: string, attempt: ShootoutAttempt): void {
    const current = this.readLedger();
    if (!current?.attempts.some((entry) => entry.id === id)) throw new Error('Shootout storage changed while this attempt was starting.');
    this.write(LEDGER_KEY, { ...current, attempts: current.attempts.map((entry) => entry.id === id ? { ...plain(attempt), season: entry.season } : entry) });
  }

  /** Web Locks keep tabs from sharing one attempt number. Without them (older browsers) the ledger is still written
   * at once; only two tabs starting in the same instant could collide, and the server rejects the duplicate. */
  private withLock<T>(work: () => Promise<T>): Promise<T> {
    return typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(LOCK_KEY, work) : work();
  }

  private blockedReason(attempts: SavedShootoutAttempt[], season: ShootoutSeason): string | null {
    if (attempts.length >= MAX_SHOOTOUT_ATTEMPTS) return `No attempts left this week. More from ${resetDay(season)}, Sydney time.`;
    // A lap the leaderboard rejected can only be skipped or renamed, so it never blocks the next attempt.
    if (attempts.some((saved) => saved.outcome?.kind === 'valid' && saved.publication === 'pending' && saved.nickname === null &&
      this.publishError(saved.attempt.id) === null)) return AWAITING_NAME;
    return null;
  }

  private reserve(car: ShootoutCar, pending: boolean): { ledger: Ledger; entry: LedgerAttempt } {
    const season = currentSeason();
    const previous = currentSeason(new Date(Date.parse(season.startsAt) - 1)).id;
    const ledger = this.readLedger() ?? { version: 2, browserToken: crypto.randomUUID(), attempts: [] } satisfies Ledger;
    const current = ledger.attempts.filter((entry) => entry.season === season.id);
    const blocked = this.blockedReason(current.map((entry) => this.readSaved(plain(entry))), season);
    if (blocked) throw new Error(blocked);
    const used = new Set(current.map((entry) => entry.number));
    const number = [1, 2, 3].find((candidate) => !used.has(candidate)) ?? MAX_SHOOTOUT_ATTEMPTS;
    const entry: LedgerAttempt = { id: crypto.randomUUID(), number, car, online: false, startedAt: new Date().toISOString(), season: season.id };
    // Older seasons can no longer be published; dropping them keeps saved replays from filling storage.
    const stale = ledger.attempts.filter((saved) => saved.season !== season.id && saved.season !== previous);
    if (pending) this.write(PENDING_START_KEY(entry.id), true);
    const next: Ledger = { version: 2, browserToken: ledger.browserToken, attempts: [...ledger.attempts.filter((saved) => !stale.includes(saved)), entry] };
    this.write(LEDGER_KEY, next);
    for (const saved of stale) for (const key of ATTEMPT_KEYS) try { this.remove(key(saved.id)); } catch { /* removed on a later start */ }
    return { ledger: next, entry };
  }

  snapshot(): ShootoutSnapshot {
    const season = currentSeason();
    try {
      const entries = this.readLedger()?.attempts.filter((entry) => entry.season === season.id) ?? [];
      const attempts = entries.map((entry) => this.readSaved(plain(entry)));
      for (const entry of entries) this.pendingStart(entry.id);
      const rawNickname = this.read(NICKNAME_KEY);
      let nickname = '';
      if (rawNickname !== null) {
        let data: unknown;
        try { data = JSON.parse(rawNickname); } catch { throw new Error(CORRUPT); }
        if (normalizeShootoutNickname(data) === data && typeof data === 'string') nickname = data;
      }
      try {
        const probeKey = `${LEDGER_KEY}.probe.${crypto.randomUUID()}`;
        this.storage().setItem(probeKey, '1');
        this.storage().removeItem(probeKey);
      } catch { throw new Error(BLOCKED); }
      return { remaining: Math.max(0, MAX_SHOOTOUT_ATTEMPTS - attempts.length), attempts, nickname, writable: true,
        season, blockedReason: this.blockedReason(attempts, season) };
    } catch (error) {
      const reason = error instanceof Error && error.message === BLOCKED ? BLOCKED : CORRUPT;
      return { remaining: 0, attempts: [], nickname: '', writable: false, season, blockedReason: reason };
    }
  }

  /** Reserves and, when online, allocates before returning (rolled back when the server refuses it). */
  async beginTimedLap(car: ShootoutCar, online: boolean): Promise<ShootoutAttempt> {
    if (!isShootoutCar(car) || typeof online !== 'boolean') throw new Error('Choose a Gen3 car for the Shootout.');
    return this.withLock(async () => {
      const { ledger, entry } = this.reserve(car, online);
      if (!online) return plain(entry);
      try {
        const allocated = await startShootoutAttempt(ledger.browserToken, plain(entry), entry.season);
        this.replaceInLedger(entry.id, allocated);
        this.remove(PENDING_START_KEY(entry.id));
        return allocated;
      } catch (error) {
        if (error instanceof ShootoutGatewayError && error.retryable) return plain(entry);
        const current = this.readLedger();
        if (current) this.write(LEDGER_KEY, { ...current, attempts: current.attempts.filter((saved) => saved.id !== entry.id) });
        this.remove(PENDING_START_KEY(entry.id));
        throw error;
      }
    });
  }

  complete(id: string, outcome: ShootoutOutcome): void {
    if (!isShootoutOutcome(outcome)) throw new Error('This lap result is invalid.');
    const { saved } = this.saved(id);
    if (saved.outcome !== null) {
      if (JSON.stringify(saved.outcome) !== JSON.stringify(outcome)) throw new Error('This Shootout attempt already has a result.');
      return;
    }
    this.write(RESULT_KEY(id), { ...saved, outcome,
      publication: outcome.kind === 'invalid' || saved.publication === 'skipped' ? 'skipped' : 'pending' } satisfies SavedShootoutAttempt);
  }

  skip(id: string): void {
    const { saved } = this.saved(id);
    if (saved.publication === 'published') throw new Error('This score is already published.');
    if (saved.nickname !== null) throw new Error('This score is already saved for publication. Retry it when the leaderboard is available.');
    this.write(RESULT_KEY(id), { ...saved, nickname: null, publication: 'skipped' } satisfies SavedShootoutAttempt);
  }

  /** After a refusal the lap keeps its result but loses its nickname, so the player can rename it or skip it. */
  private reject(id: string, message: string): void {
    const { saved } = this.saved(id);
    this.write(RESULT_KEY(id), { ...saved, nickname: null, publication: 'pending' } satisfies SavedShootoutAttempt);
    this.write(ERROR_KEY(id), message.slice(0, 300));
  }

  private readReplay(id: string): string | null {
    try {
      const raw = this.read(REPLAY_KEY(id));
      const replay: unknown = raw === null ? null : JSON.parse(raw);
      return typeof replay === 'string' && replay.length <= MAX_REPLAY_CHARS ? replay : null;
    } catch { return null; }
  }

  async submit(id: string, nicknameInput: string): Promise<'published' | 'saved'> {
    const problem = shootoutNicknameError(nicknameInput);
    if (problem !== null) throw new Error(problem === 'Enter a nickname.' ? 'Enter a nickname, or skip publishing.' : problem);
    const nickname = normalizeShootoutNickname(nicknameInput) ?? '';
    const { ledger, entry, saved } = this.saved(id);
    if (saved.publication === 'skipped') throw new Error('This attempt was skipped.');
    if (!saved.outcome || saved.outcome.kind !== 'valid') throw new Error('Only a valid completed lap can be published.');
    if (saved.nickname !== null && saved.nickname !== nickname && normalizeShootoutNickname(saved.nickname) === saved.nickname) {
      throw new Error('Retry this result with the nickname already saved.');
    }
    if (saved.publication === 'published') return 'published';
    const { timeS, sectorsS } = saved.outcome;
    this.write(RESULT_KEY(id), { ...saved, nickname, publication: 'pending' } satisfies SavedShootoutAttempt);
    this.write(NICKNAME_KEY, nickname);
    if (offline()) return 'saved';
    let attempt = plain(entry);
    try {
      if (!attempt.online) {
        if (!this.pendingStart(id)) {
          // Started offline (kept in this browser only), or the server already refused the start.
          const refused = this.publishError(id);
          if (refused === null) return 'saved';
          this.reject(id, refused);
          throw new Error(refused);
        }
        this.remove(ERROR_KEY(id));
        attempt = await this.withLock(async () => {
          const latest = this.saved(id);
          if (latest.entry.online) return plain(latest.entry);
          const allocated = await startShootoutAttempt(latest.ledger.browserToken, plain(latest.entry), latest.entry.season);
          this.replaceInLedger(id, allocated);
          this.remove(PENDING_START_KEY(id));
          return allocated;
        }).catch((error: unknown) => {
          if (error instanceof ShootoutGatewayError && !error.retryable) this.remove(PENDING_START_KEY(id));
          throw error;
        });
      }
      this.remove(ERROR_KEY(id));
      const rank = await publishShootoutAttempt(ledger.browserToken, { attempt, nickname, timeS, sectorsS, replay: this.readReplay(id) });
      const latest = this.saved(id).saved;
      this.write(RESULT_KEY(id), { ...latest, nickname, publication: 'published' } satisfies SavedShootoutAttempt);
      if (rank) this.write(RANK_KEY(id), rank);
      return 'published';
    } catch (error) {
      if (!(error instanceof ShootoutGatewayError)) throw error;
      // A start limit keeps the lap queued but says why, instead of a silent "saved".
      if (error.retryable && error.status !== 429) return 'saved';
      if (!error.retryable) this.reject(id, error.message);
      throw error;
    }
  }

  /** Saves a new attempt in this browser at once, without waiting for the network, and returns it (online: false
   * until allocateInBackground confirms it). Throws when no attempt is left this season or storage is unusable. */
  async reserveTimedLap(car: ShootoutCar): Promise<ShootoutAttempt> {
    if (!isShootoutCar(car)) throw new Error('Choose a Gen3 car for the Shootout.');
    return this.withLock(async () => plain(this.reserve(car, true).entry));
  }

  /** Allocates a reserved attempt on the server; failures are kept for a later retry. Never throws. */
  async allocateInBackground(id: string): Promise<void> {
    const delays = this.options.allocationRetryMs ?? ALLOCATION_RETRY_MS;
    try {
      for (let retry = 0; ; retry++) {
        if (await this.withLock(() => this.allocate(id)) === 'done' || retry >= delays.length) return;
        const elapsed = Date.now() - Date.parse(this.saved(id).entry.startedAt);
        if (elapsed + delays[retry] > ALLOCATION_WINDOW_MS) return;
        await new Promise((resolve) => setTimeout(resolve, delays[retry]));
      }
    } catch { /* the pending start stays saved; submit retries it */ }
  }

  private async allocate(id: string): Promise<'done' | 'retry'> {
    const { ledger, entry } = this.saved(id);
    if (entry.online || !this.pendingStart(id)) return 'done';
    if (offline()) return 'retry';
    try {
      const allocated = await startShootoutAttempt(ledger.browserToken, plain(entry), entry.season);
      this.replaceInLedger(id, allocated);
      this.remove(PENDING_START_KEY(id));
      return 'done';
    } catch (error) {
      if (!(error instanceof ShootoutGatewayError)) throw error;
      if (error.retryable) return 'retry';
      // Refused for good (no attempts left on the server, a closed week): the lap stays used and cannot be published.
      this.write(ERROR_KEY(id), error.message.slice(0, 300));
      this.remove(PENDING_START_KEY(id));
      return 'done';
    }
  }

  /** Saves the timed lap's replay (encodeReplay) with its result, for upload with the score. Best effort: a replay
   * that is too long or cannot be stored is dropped, and the score publishes without it. */
  saveReplay(id: string, replay: string): void {
    try {
      if (typeof replay !== 'string' || replay.length > MAX_REPLAY_CHARS || decodeReplay(replay) === null) return;
      this.saved(id);
      this.write(REPLAY_KEY(id), replay);
    } catch { /* optional */ }
  }

  /** The published lap's place in its season, once known. */
  rankOf(id: string): ShootoutRank | null {
    try {
      const raw = this.read(RANK_KEY(id));
      const rank: unknown = raw === null ? null : JSON.parse(raw);
      return isShootoutRank(rank) ? { rank: rank.rank, of: rank.of } : null;
    } catch { return null; }
  }

  /** The last non-retryable publish error; the saved nickname is cleared so the player can edit it or skip. */
  publishError(id: string): string | null {
    try {
      const raw = this.read(ERROR_KEY(id));
      const message: unknown = raw === null ? null : JSON.parse(raw);
      return typeof message === 'string' && message.length > 0 ? message : null;
    } catch { return null; }
  }
}
