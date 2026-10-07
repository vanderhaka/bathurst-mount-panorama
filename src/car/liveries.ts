import type { CarKind } from '@/car/car-specs';
import { LIVERY_COLOURS as C } from '@/art/palette';
import type { Livery } from '@/types/car-model';

export interface LiveryPreset {
  name: string;
  livery: Livery;
}

/** Generic, fictional liveries (no real teams or sponsors). */
export const LIVERY_PRESETS: Record<CarKind, LiveryPreset[]> = {
  camaro: [
    { name: 'Heritage Red', livery: { primary: C.heritageRed, secondary: C.racingWhite, accent: C.carbonBlack, number: 97, banner: 'PANORAMA', pattern: 'stripes' } },
    { name: 'Midnight', livery: { primary: C.carbonBlack, secondary: C.yellow, accent: C.silver, number: 8, banner: 'SKYLINE', pattern: 'arrow' } },
    { name: 'Lime Rush', livery: { primary: C.limeGreen, secondary: C.carbonBlack, accent: C.racingWhite, number: 88, banner: 'CONROD', pattern: 'chevron' } },
    { name: 'Royal', livery: { primary: C.royalPurple, secondary: C.racingWhite, accent: C.yellow, number: 25, banner: 'THE CHASE', pattern: 'split' } },
  ],
  mustang: [
    { name: 'Blue Oval Blue', livery: { primary: C.fordBlue, secondary: C.racingWhite, accent: C.heritageRed, number: 17, banner: 'PANORAMA', pattern: 'stripes' } },
    { name: 'Sunset', livery: { primary: C.sunsetOrange, secondary: C.carbonBlack, accent: C.racingWhite, number: 6, banner: 'GRIFFINS', pattern: 'arrow' } },
    { name: 'Silver Arrow', livery: { primary: C.silver, secondary: C.teal, accent: C.carbonBlack, number: 55, banner: 'THE CUTTING', pattern: 'chevron' } },
    { name: 'Snow', livery: { primary: C.racingWhite, secondary: C.fordBlue, accent: C.heritageRed, number: 26, banner: 'MURRAYS', pattern: 'split' } },
  ],
};
