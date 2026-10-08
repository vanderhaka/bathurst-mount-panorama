// Anonymous, cookieless usage counts (Vercel Web Analytics). Every event is billed, so they are few:
// one page view, one race start, and at most one event per lap milestone of a race.
// The Pro plan allows 2 properties per event, so every event carries exactly track and car.
// Page views, visitors, country and device type come from the page-view script itself.
import { inject, track as sendEvent } from '@vercel/analytics';
import type { CarKind } from '@/car/car-specs';
import { USAGE_ANALYTICS } from '@/config/build-flags';
import type { CircuitId } from '@/track/circuits';

/** Laps driven in one race that send a `laps_<n>` event (a funnel of how far players drive). */
export const LAP_MILESTONES: readonly number[] = [1, 5, 10, 25, 50];

let enabled = false;

/** Starts page-view counting. Does nothing unless `on` (default: the production build flag). */
export function initUsageAnalytics(on: boolean = USAGE_ANALYTICS): void {
  if (!on || enabled) return;
  inject({ mode: 'production' });
  enabled = true;
}

/** A race was started from the menu. */
export function trackRaceStart(track: CircuitId, car: CarKind): void {
  send('race_start', { track, car });
}

/** A timed lap was completed; `lapsThisRace` counts it. Only milestone counts send an event. */
export function trackLapsDriven(track: CircuitId, car: CarKind, lapsThisRace: number): void {
  if (LAP_MILESTONES.includes(lapsThisRace)) send(`laps_${lapsThisRace}`, { track, car });
}

/** sendEvent() throws in Node and in non-production builds, so it is only called once initialised. */
function send(name: string, props: { track: CircuitId; car: CarKind }): void {
  if (enabled) sendEvent(name, props);
}
