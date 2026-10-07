import * as THREE from 'three';
import type { ToneMapper } from '@/config/graphics';

export const TONE_MAPPING: Record<ToneMapper, THREE.ToneMapping> = {
  ACES: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
};
