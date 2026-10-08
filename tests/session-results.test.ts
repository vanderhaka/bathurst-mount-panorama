import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarKind } from '@/car/car-specs';
import { sessionResults } from '@/game/session-results';
import { saveRecords } from '@/race/records';
import type { LapRecord } from '@/types/session';
import { ResultsScreen } from '@/ui/screens/results';
import { findText, type MenuNode, stubMenuDom } from './menu-dom-fixture';

const lap = (car: CarKind, timeS: number, dateIso: string, valid = true): LapRecord => ({ car, timeS, sectorsS: [40, 40, timeS - 80], valid, dateIso });
const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
});
afterEach(() => vi.unstubAllGlobals());

describe('results after a session', () => {
  it('lists the laps just driven in this car, by time driven, while the cards keep every car’s best', () => {
    const supra = Array.from({ length: 20 }, (_, i) => lap('supra', 123 + i, `2026-10-01T00:${String(i).padStart(2, '0')}:00Z`));
    saveRecords('supra', { bestS: 123, bestSectors: [40, 40, 43], laps: supra });
    const savedCamaro = [lap('camaro', 124.2, '2026-10-02T00:00:00Z'), lap('camaro', 126, '2026-10-02T00:03:00Z')];
    const driven = [lap('camaro', 125.5, '2026-10-08T10:02:00Z'), lap('camaro', 131, '2026-10-08T10:00:00Z', false), lap('camaro', 124.9, '2026-10-08T10:04:00Z')];
    const [laps, best] = sessionResults({ car: 'camaro', laps: [...savedCamaro, ...driven], sessionLaps: driven, track: { id: 'bathurst' } });
    expect(laps.map((l) => l.dateIso)).toEqual(['2026-10-08T10:00:00Z', '2026-10-08T10:02:00Z', '2026-10-08T10:04:00Z']);
    expect(laps.every((l) => l.car === 'camaro')).toBe(true);
    expect(best.supra?.timeS).toBe(123);
    expect(best.camaro?.timeS).toBe(124.2); // saved best still counts for the card
  });

  it('counts only this session in the summary and tags the fastest car across all records', () => {
    stubMenuDom();
    const screen = new ResultsScreen({ again() {}, changeCar() {}, menu() {}, telemetry() {}, backToSession() {} });
    const driven = [lap('camaro', 126, '2026-10-08T10:00:00Z'), lap('camaro', 127, '2026-10-08T10:02:00Z')];
    screen.set(driven, { camaro: driven[0], supra: lap('supra', 125, '2026-10-01T00:00:00Z') });
    const root = screen.el as unknown as MenuNode;
    expect(findText(root, 'Experienced · 2 laps · 2 valid')).not.toBeNull();
    expect(root.querySelectorAll('tr').length).toBe(1 + 2); // head + this session's laps
    const cards = root.querySelectorAll('.mn-best');
    const overall = cards.filter((c) => c.classList.contains('is-overall')).map((c) => c.textContent);
    expect(overall).toHaveLength(1);
    expect(overall[0]).toMatch(/^GR Supra/);
  });
});

describe('driving levels in Results', () => {
  it('names the level in the summary and tags only the laps driven at another level', () => {
    stubMenuDom();
    const screen = new ResultsScreen({ again() {}, changeCar() {}, menu() {}, telemetry() {}, backToSession() {} });
    const old = lap('camaro', 126, '2026-10-08T10:00:00Z');
    const casual: LapRecord = { ...lap('camaro', 120, '2026-10-08T10:02:00Z'), level: 'casual' };
    const superstar: LapRecord = { ...lap('camaro', 128, '2026-10-08T10:04:00Z'), level: 'superstar' };
    screen.set([old, casual, superstar], { camaro: superstar }, 'superstar');
    const root = screen.el as unknown as MenuNode;
    expect(findText(root, 'Superstar · 3 laps · 3 valid')).not.toBeNull();
    const rows = root.querySelectorAll('tr').slice(1);
    expect(findText(rows[0], 'Experienced')).not.toBeNull(); // saved before levels = Experienced
    expect(findText(rows[1], 'Casual')).not.toBeNull();
    expect(findText(rows[2], 'Superstar')).toBeNull(); // the session's own level needs no tag
  });
});

describe('standing-start laps in Results', () => {
  it('labels the standing lap as a standing start, not as an invalid lap', () => {
    stubMenuDom();
    const screen = new ResultsScreen({ again() {}, changeCar() {}, menu() {}, telemetry() {}, backToSession() {} });
    const standing: LapRecord = { ...lap('camaro', 131, '2026-10-08T10:00:00Z', false), standing: true };
    const invalid = lap('camaro', 127, '2026-10-08T10:04:00Z', false);
    screen.set([standing, lap('camaro', 126, '2026-10-08T10:02:00Z'), invalid], {});
    const rows = (screen.el as unknown as MenuNode).querySelectorAll('tr').slice(1);
    expect(findText(rows[0], 'Standing start')).not.toBeNull();
    expect(findText(rows[0], 'Invalid')).toBeNull();
    expect(rows[0].classList.contains('is-invalid')).toBe(false);
    expect(rows[0].querySelectorAll('.is-invalid')).toHaveLength(0); // no strikethrough
    expect(findText(rows[2], 'Invalid')).not.toBeNull();
    expect(rows[2].classList.contains('is-invalid')).toBe(true);
  });
});
