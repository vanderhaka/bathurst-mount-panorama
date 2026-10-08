// Records are written when the browser is idle (a synchronous localStorage write at the
// timing line costs a frame), but never left behind: quitting the race, switching circuit
// and hiding or closing the page write pending records at once.
import type { CarKind } from '@/car/car-specs';
import { saveRecords, type CarRecords } from '@/race/records';
import type { CircuitId } from '@/track/circuits';

const pending = new Map<string, () => void>();
let scheduled = false;
let listening = false;

/** Saves soon; a later save for the same car and circuit replaces a pending one. */
export function queueRecordsSave(car: CarKind, records: CarRecords, circuit: CircuitId): void {
  pending.set(`${circuit}.${car}`, () => saveRecords(car, records, circuit));
  listenForPageHide();
  if (scheduled) return;
  scheduled = true;
  whenIdle(() => {
    scheduled = false;
    flushRecords();
  });
}

/** Writes every pending save now. */
export function flushRecords(): void {
  const saves = [...pending.values()];
  pending.clear();
  for (const save of saves) save();
}

/** `pagehide` covers closing and navigating; a hidden page (app switch) may be discarded without it. */
function listenForPageHide(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('pagehide', flushRecords);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushRecords(); });
}

function whenIdle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 3000 });
  else setTimeout(fn, 0);
}
