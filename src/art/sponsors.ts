/**
 * Fictional sponsors of the game world (no real brands). The trackside boards,
 * wall signs and car liveries all use this list. Colours are CSS strings for canvas painting.
 */
/** `shortTag` is used where space is tight (car decals). */
export interface Sponsor { name: string; tag: string; shortTag?: string; bg: string; fg: string; accent: string }

export const SPONSORS: readonly Sponsor[] = [
  { name: 'PANORAMA', tag: 'PETROLEUM', bg: '#c8102e', fg: '#ffffff', accent: '#1b1c1e' },
  { name: 'MOUNTAIN ROAST', tag: 'COFFEE CO.', shortTag: 'COFFEE', bg: '#3b2a20', fg: '#f1e4cc', accent: '#c98a3c' },
  { name: 'SKYLINE', tag: 'RADIO 98.7 FM', shortTag: 'RADIO 98.7', bg: '#103f8c', fg: '#ffffff', accent: '#f5c518' },
  { name: 'CONROD', tag: 'MOTOR OILS', bg: '#1b1c1e', fg: '#8cc63f', accent: '#ffffff' },
  { name: 'CENTRAL WEST', tag: 'TYRES', bg: '#f5c518', fg: '#1b1c1e', accent: '#c8102e' },
  { name: 'GOLD COUNTRY', tag: 'BANK', bg: '#0b2a4a', fg: '#e3c06a', accent: '#ffffff' },
  { name: 'ESSES', tag: 'ENERGY', bg: '#8cc63f', fg: '#111214', accent: '#ffffff' },
  { name: 'HELL CORNER', tag: 'HOT SAUCE', bg: '#f06a1d', fg: '#1b1c1e', accent: '#ffffff' },
];
