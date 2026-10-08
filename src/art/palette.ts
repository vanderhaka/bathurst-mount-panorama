// Shared colour palette for the medium-poly art direction.
// Mount Panorama on an October (spring) afternoon: green-gold grass, grey-green
// eucalypts, red-brown clay, pale concrete, warm low sun. See docs/ART_DIRECTION.md.
// All values are sRGB hex. three.js converts them to linear on use.

export const SKY = {
  zenith: 0x3f7fcf,
  mid: 0x8fbbe3,
  horizon: 0xd9e6ea,
  haze: 0xc9d8de,
  sun: 0xfff0d2,
} as const;

export const GROUND = {
  grassLight: 0x9ca263,
  grass: 0x7a874c,
  grassDark: 0x5a663b,
  grassDry: 0xb3a06c,
  clay: 0xa06c45,
  clayDark: 0x7a4f33,
  gravel: 0xbfab8c,
  sand: 0xcdb98f,
  rock: 0x8c8378,
} as const;

export const FOLIAGE = {
  eucalyptA: 0x6f8050,
  eucalyptB: 0x5c6c44,
  eucalyptSilver: 0x8c9a72,
  /**
   * Gum crown gradient, blue-grey → grey-green → sage → olive → dark olive. Dark and cool:
   * eucalypt bush reads darker and bluer than the grass, and the warm game sun and grade
   * shift foliage towards yellow on screen.
   */
  eucalyptBlueGrey: 0x607070,
  eucalyptGreyGreen: 0x586a60,
  eucalyptSage: 0x5f7062,
  eucalyptOlive: 0x5a6954,
  eucalyptDarkOlive: 0x495846,
  /** Blue-silver sheen on the sunlit tops of gum clumps. */
  eucalyptSheen: 0x7d8e8a,
  eucalyptTrunk: 0xd2c9b6,
  /** Smooth white-grey gum bark (upper trunk and limbs). */
  eucalyptTrunkPale: 0xd8dad6,
  eucalyptBark: 0x8a7764,
  /** Shedding bark ribbons hanging at the base of smooth gums. */
  eucalyptBarkStrip: 0x9a7a5e,
  /** Rough, fibrous grey-brown bark of box gums (Yellow Box, Grey Box). */
  eucalyptBoxBark: 0x948a7c,
  /** Weathered silver-grey dead wood (stags, dead limbs). */
  eucalyptDeadWood: 0xaeaaa2,
  pine: 0x3e5934,
  pineDark: 0x2f4529,
  pineTrunk: 0x6a4a33,
  shrub: 0x67764a,
} as const;

export const ROAD = {
  asphalt: 0x3b3c3e,
  asphaltWorn: 0x4b4c4e,
  groove: 0x333436,
  lineWhite: 0xf0f0ec,
  kerbRed: 0xb3352f,
  kerbWhite: 0xe6e5df,
  pitLaneLine: 0xf2d22e,
} as const;

export const TRACKSIDE = {
  concrete: 0xc9c5ba,
  concreteDark: 0x9e9a90,
  fencePost: 0x9aa1a6,
  fenceMesh: 0xa3abb1,
  tyre: 0x1d1e20,
  tyreBeltWhite: 0xe9e9e6,
  tyreBeltBlue: 0x2b5fb3,
  armco: 0xb9c0c5,
  marshalOrange: 0xe8742a,
} as const;

export const BUILDING = {
  white: 0xebeae4,
  offWhite: 0xd8d6cd,
  grey: 0x9ea4a7,
  darkGrey: 0x50565b,
  glass: 0x2d3d4b,
  glassLight: 0x5f7a8e,
  roof: 0xb9bfc3,
  roofRed: 0x9c3b2e,
  colorbondGreen: 0x5c6f55,
  brick: 0xa45a3f,
  timber: 0x8b6a48,
  accentRed: 0xc8102e,
  accentBlue: 0x0b3d91,
  accentYellow: 0xf2c230,
} as const;

/** Paint colours offered for car liveries (not real team liveries). */
export const LIVERY_COLOURS = {
  heritageRed: 0xc8102e,
  fordBlue: 0x1c4fa1,
  racingWhite: 0xf1f1ee,
  carbonBlack: 0x1b1c1e,
  sunsetOrange: 0xf06a1d,
  limeGreen: 0x8cc63f,
  royalPurple: 0x5b2c83,
  silver: 0xb8bcc0,
  yellow: 0xf5c518,
  teal: 0x0f8b8d,
} as const;

export const HUD = {
  personalBest: '#33d17a',
  overallBest: '#b44cf0',
  slower: '#f5c518',
  warn: '#ff4d3a',
} as const;
