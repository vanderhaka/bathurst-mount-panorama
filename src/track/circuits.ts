export type CircuitId = 'bathurst' | 'adelaide';

export const CIRCUITS = {
  bathurst: { name: 'Mount Panorama', city: 'Bathurst', title: ['Mount', 'Panorama'], location: 'Bathurst · New South Wales', lengthM: 6213,
    facts: [['Length', '6.213', 'km'], ['Turns', '23', ''], ['Elevation change', '174', 'm']] },
  adelaide: { name: 'Adelaide Parklands', city: 'Adelaide', title: ['Adelaide', 'Parklands'], location: 'Adelaide · South Australia', lengthM: 3219,
    facts: [['Length', '3.219', 'km'], ['Turns', '14', ''], ['Direction', 'Clockwise', '']] },
} as const;

export function circuitFromSearch(search: string): CircuitId {
  return new URLSearchParams(search).get('track') === 'adelaide' ? 'adelaide' : 'bathurst';
}

export function circuitUrl(url: string, circuit: CircuitId): string {
  const next = new URL(url);
  if (circuit === 'adelaide') next.searchParams.set('track', circuit);
  else next.searchParams.delete('track');
  return next.href;
}

export const ACTIVE_CIRCUIT: CircuitId = typeof location === 'undefined' ? 'bathurst' : circuitFromSearch(location.search);
