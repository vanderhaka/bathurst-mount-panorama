/**
 * Fictional sponsors of the game world (no real brands). The Mount Panorama trackside boards,
 * wall signs and the car liveries all use this list. Colours are CSS strings for canvas painting.
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

/**
 * Generated fictional sponsors for the Adelaide street circuit's wall signs. They share no name
 * with a Bathurst corner, region or brand, and are never used on car liveries.
 */
export const ADELAIDE_SPONSORS: readonly Sponsor[] = [
  { name: 'PARKLANDS', tag: 'POWER', bg: '#0d5c63', fg: '#ffffff', accent: '#f2c14e' },
  { name: 'GULF COAST', tag: 'SEAFOOD', bg: '#12355b', fg: '#f4f1de', accent: '#ff8c42' },
  { name: 'RIVER LOOP', tag: 'COURIERS', bg: '#e63946', fg: '#ffffff', accent: '#1d1d1f' },
  { name: 'SALTBUSH', tag: 'BREWING CO.', bg: '#1f4d2b', fg: '#f3e9c6', accent: '#d9a441' },
  { name: 'BLUE GUM', tag: 'BUILDERS', bg: '#f1ede2', fg: '#14213d', accent: '#e07a1f' },
  { name: 'SOUTHERN ARC', tag: 'ELECTRIC', bg: '#2b2d42', fg: '#edf2f4', accent: '#ef233c' },
  { name: 'WATTLE', tag: 'CREDIT UNION', bg: '#ffd23f', fg: '#1b1c1e', accent: '#0d5c63' },
  { name: 'CITY GRID', tag: 'FIBRE', bg: '#0a8f8f', fg: '#10151a', accent: '#ffffff' },
];

/**
 * Generated fictional sponsors for the Gold Coast street circuit's wall signs. They share no name
 * with a Bathurst or Adelaide brand or any real corner sponsor, and are never used on car liveries.
 */
export const GOLD_COAST_SPONSORS: readonly Sponsor[] = [
  { name: 'SANDBAR', tag: 'SURF CO.', bg: '#0b3c5d', fg: '#ffffff', accent: '#ffb703' },
  { name: 'HINTERLAND', tag: 'DAIRY', bg: '#f6f1e7', fg: '#1b4332', accent: '#d62828' },
  { name: 'BREAKWALL', tag: 'MARINE', bg: '#d8f3dc', fg: '#081c15', accent: '#e76f51' },
  { name: 'SEVENTY FIVE', tag: 'SUNSCREEN', bg: '#fb8500', fg: '#10151a', accent: '#ffffff' },
  { name: 'LONGBOARD', tag: 'LAGER', bg: '#2a1a0f', fg: '#fdf0d5', accent: '#48cae4' },
  { name: 'TIDEWATER', tag: 'INSURANCE', bg: '#5a189a', fg: '#ffffff', accent: '#ffd166' },
  { name: 'CORAL SEA', tag: 'FREIGHT', bg: '#ef476f', fg: '#10151a', accent: '#fff3b0' },
  { name: 'PANDANUS', tag: 'HOTELS', bg: '#06d6a0', fg: '#10151a', accent: '#073b4c' },
];
