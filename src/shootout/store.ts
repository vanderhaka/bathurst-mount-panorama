import {
  type ShootoutRank, type ShootoutSeason,
  isShootoutAttempt, isShootoutCar, isShootoutOutcome, isUuid, MAX_SHOOTOUT_ATTEMPTS, normalizeShootoutNickname,
  type SavedShootoutAttempt, type ShootoutAttempt, type ShootoutCar, type ShootoutOutcome,
} from './model';
import { publishShootoutAttempt, ShootoutGatewayError, startShootoutAttempt } from './leaderboard';

const LEDGER_KEY = 'bathurst.shootout.v1';
const NICKNAME_KEY = `${LEDGER_KEY}.nickname`;
const RESULT_KEY = (id: string) => `${LEDGER_KEY}.result.${id}`;
const PENDING_START_KEY = (id: string) => `${LEDGER_KEY}.start.${id}`;
const LOCK_KEY = `${LEDGER_KEY}.start`;

interface Ledger {
  version: 1;
  browserToken: string;
  attempts: ShootoutAttempt[];
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

function isLedger(value: unknown): value is Ledger {
  return typeof value === 'object' && value !== null && 'version' in value && value.version === 1 &&
    'browserToken' in value && isUuid(value.browserToken) && 'attempts' in value && Array.isArray(value.attempts) &&
    value.attempts.length <= MAX_SHOOTOUT_ATTEMPTS && value.attempts.every(isShootoutAttempt) &&
    value.attempts.every((attempt: ShootoutAttempt, index: number) => attempt.number === index + 1) &&
    new Set(value.attempts.map((attempt: ShootoutAttempt) => attempt.id)).size === value.attempts.length;
}

function parseSaved(value: unknown, attempt: ShootoutAttempt): SavedShootoutAttempt {
  if (typeof value !== 'object' || value === null || !('attempt' in value) || !isShootoutAttempt(value.attempt) ||
    value.attempt.id !== attempt.id || value.attempt.number !== attempt.number || value.attempt.car !== attempt.car ||
    !('outcome' in value) || value.outcome !== null && !isShootoutOutcome(value.outcome) ||
    !('nickname' in value) || value.nickname !== null && (typeof value.nickname !== 'string' || normalizeShootoutNickname(value.nickname) !== value.nickname) ||
    !('publication' in value) || !['pending', 'published', 'skipped'].includes(String(value.publication)) ||
    value.publication === 'published' && (value.outcome === null || value.outcome.kind !== 'valid' || value.nickname === null || !attempt.online)) {
    throw new Error('Saved Shootout data is corrupt. Attempts are disabled for this browser.');
  }
  if (value.publication !== 'pending' && value.publication !== 'published' && value.publication !== 'skipped') {
    throw new Error('Saved Shootout data is corrupt.');
  }
  return { attempt, outcome: value.outcome, nickname: value.nickname, publication: value.publication };
}

export class ShootoutStore {
  private storage(): Storage {
    try { return localStorage; } catch { throw new Error('Browser storage is blocked. Shootout attempts cannot be saved.'); }
  }

  private readLedger(): Ledger | null {
    let raw: string | null;
    try { raw = this.storage().getItem(LEDGER_KEY); } catch { throw new Error('Browser storage is blocked. Shootout attempts cannot be saved.'); }
    if (raw === null) return null;
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new Error('Saved Shootout data is corrupt. Attempts are disabled for this browser.'); }
    if (!isLedger(data)) throw new Error('Saved Shootout data is corrupt. Attempts are disabled for this browser.');
    return data;
  }

  private write(key: string, value: unknown): void {
    try { this.storage().setItem(key, JSON.stringify(value)); } catch {
      throw new Error('Browser storage is full or blocked. Shootout attempts cannot be saved.');
    }
  }

  private readSaved(attempt: ShootoutAttempt): SavedShootoutAttempt {
    const raw = this.storage().getItem(RESULT_KEY(attempt.id));
    if (raw === null) return { attempt, outcome: null, nickname: null, publication: 'pending' };
    let data: unknown;
    try { data = JSON.parse(raw); } catch { throw new Error('Saved Shootout data is corrupt. Attempts are disabled for this browser.'); }
    return parseSaved(data, attempt);
  }

  private pendingStart(id: string): boolean {
    const raw = this.storage().getItem(PENDING_START_KEY(id));
    if (raw !== null && raw !== 'true') throw new Error('Saved Shootout data is corrupt. Attempts are disabled for this browser.');
    return raw === 'true';
  }

  private saved(id: string): { ledger: Ledger; saved: SavedShootoutAttempt } {
    const ledger = this.readLedger();
    const attempt = ledger?.attempts.find((candidate) => candidate.id === id);
    if (!ledger || !attempt) throw new Error('This Shootout attempt was not saved in this browser.');
    return { ledger, saved: this.readSaved(attempt) };
  }

  snapshot(): ShootoutSnapshot {
    try {
      const ledger = this.readLedger();
      const attempts = ledger?.attempts.map((attempt) => this.readSaved(attempt)) ?? [];
      for (const saved of attempts) this.pendingStart(saved.attempt.id);
      const rawNickname = this.storage().getItem(NICKNAME_KEY);
      let nickname = '';
      if (rawNickname !== null) {
        const data: unknown = JSON.parse(rawNickname);
        if (normalizeShootoutNickname(data) !== data || typeof data !== 'string') throw new Error('Saved nickname is corrupt.');
        nickname = data;
      }
      const probeKey = `${LEDGER_KEY}.probe.${crypto.randomUUID()}`;
      this.storage().setItem(probeKey, '1');
      this.storage().removeItem(probeKey);
      return { remaining: MAX_SHOOTOUT_ATTEMPTS - attempts.length, attempts, nickname,
        writable: typeof navigator !== 'undefined' && !!navigator.locks };
    } catch {
      return { remaining: 0, attempts: [], nickname: '', writable: false };
    }
  }

  async beginTimedLap(car: ShootoutCar, online: boolean): Promise<ShootoutAttempt> {
    if (!isShootoutCar(car) || typeof online !== 'boolean') throw new Error('Choose a Gen3 car for the Shootout.');
    if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('This browser cannot safely share Shootout attempts between tabs.');
    return navigator.locks.request(LOCK_KEY, async () => {
      const ledger = this.readLedger() ?? { version: 1, browserToken: crypto.randomUUID(), attempts: [] } satisfies Ledger;
      if (ledger.attempts.length >= MAX_SHOOTOUT_ATTEMPTS) throw new Error('All three Shootout attempts have been used in this browser.');
      let attempt: ShootoutAttempt = { id: crypto.randomUUID(), number: ledger.attempts.length + 1, car,
        online: false, startedAt: new Date().toISOString() };
      if (online) this.write(PENDING_START_KEY(attempt.id), true);
      this.write(LEDGER_KEY, { ...ledger, attempts: [...ledger.attempts, attempt] });
      if (online) {
        try {
          attempt = await startShootoutAttempt(ledger.browserToken, attempt);
        } catch (error) {
          if (!(error instanceof ShootoutGatewayError) || !error.retryable) {
            this.write(LEDGER_KEY, ledger);
            this.storage().removeItem(PENDING_START_KEY(attempt.id));
            throw error;
          }
        }
      }
      const current = this.readLedger();
      if (!current || current.browserToken !== ledger.browserToken) throw new Error('Shootout storage changed while this attempt was starting.');
      this.write(LEDGER_KEY, { ...current, attempts: current.attempts.map((saved) => saved.id === attempt.id ? attempt : saved) });
      if (attempt.online) this.storage().removeItem(PENDING_START_KEY(attempt.id));
      return attempt;
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

  async submit(id: string, nicknameInput: string): Promise<'published' | 'saved'> {
    const nickname = normalizeShootoutNickname(nicknameInput);
    if (nickname === null) throw new Error('Enter a nickname of 1 to 24 characters, or skip publishing.');
    const { ledger, saved } = this.saved(id);
    if (saved.publication === 'skipped') throw new Error('This attempt was skipped.');
    if (!saved.outcome || saved.outcome.kind !== 'valid') throw new Error('Only a valid completed lap can be published.');
    if (saved.nickname !== null && saved.nickname !== nickname) throw new Error('Retry this result with the nickname already saved.');
    if (saved.publication === 'published') return 'published';
    const pending: SavedShootoutAttempt = { ...saved, nickname, publication: 'pending' };
    this.write(RESULT_KEY(id), pending);
    this.write(NICKNAME_KEY, nickname);
    if (typeof navigator === 'undefined' || navigator.onLine === false) return 'saved';
    let attempt = saved.attempt;
    if (!attempt.online) {
      if (!this.pendingStart(id)) return 'saved';
      if (!navigator.locks) throw new Error('This browser cannot safely share Shootout attempts between tabs.');
      try {
        attempt = await navigator.locks.request(LOCK_KEY, async () => {
          const latest = this.saved(id);
          const allocated = await startShootoutAttempt(latest.ledger.browserToken, latest.saved.attempt);
          this.write(LEDGER_KEY, { ...latest.ledger, attempts: latest.ledger.attempts.map((item) => item.id === id ? allocated : item) });
          this.storage().removeItem(PENDING_START_KEY(id));
          return allocated;
        });
      } catch (error) {
        if (error instanceof ShootoutGatewayError && error.retryable) return 'saved';
        throw error;
      }
    }
    try {
      await publishShootoutAttempt(ledger.browserToken, { attempt, nickname,
        timeS: saved.outcome.timeS, sectorsS: saved.outcome.sectorsS });
    } catch (error) {
      if (error instanceof ShootoutGatewayError && error.retryable) return 'saved';
      throw error;
    }
    const latest = this.saved(id).saved;
    this.write(RESULT_KEY(id), { ...latest, nickname, publication: 'published' } satisfies SavedShootoutAttempt);
    return 'published';
  }

  // ---- Contract (implementations to come).

  /** Saves a new attempt in this browser at once, without waiting for the network, and returns it (online: false
   * until allocateInBackground confirms it). Throws when no attempt is left this season or storage is unusable. */
  async reserveTimedLap(car: ShootoutCar): Promise<ShootoutAttempt> {
    void car;
    throw new Error('reserveTimedLap: not implemented yet');
  }

  /** Allocates a reserved attempt on the server; failures are kept for a later retry. Never throws. */
  async allocateInBackground(id: string): Promise<void> {
    void id;
    throw new Error('allocateInBackground: not implemented yet');
  }

  /** Saves the timed lap's replay (encodeReplay) with its result, for upload with the score. */
  saveReplay(id: string, replay: string): void {
    void id; void replay;
    throw new Error('saveReplay: not implemented yet');
  }

  /** The published lap's place in its season, once known. */
  rankOf(id: string): ShootoutRank | null {
    void id;
    throw new Error('rankOf: not implemented yet');
  }

  /** The last non-retryable publish error; the saved nickname is cleared so the player can edit it or skip. */
  publishError(id: string): string | null {
    void id;
    throw new Error('publishError: not implemented yet');
  }
}
