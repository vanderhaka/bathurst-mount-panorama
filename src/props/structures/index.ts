import type { StructureFactory } from '@/types/props';
import { buildBuilding } from '@/props/structures/building';
import { buildControlTower } from '@/props/structures/control-tower';
import { buildFootBridge } from '@/props/structures/foot-bridge';
import { buildStartGantry, buildVideoScreen } from '@/props/structures/gantry';
import { buildGrandstand } from '@/props/structures/grandstand';
import { buildHillsideLetters } from '@/props/structures/letters';
import { buildPitBuilding } from '@/props/structures/pit-building';

// One-off structures. Each returns a Group with one merged mesh per material
// (base / metal / glass / emissive), +Z facing the track, metres.

export const structures: StructureFactory = {
  pitBuilding: buildPitBuilding,
  controlTower: buildControlTower,
  grandstand: buildGrandstand,
  startGantry: buildStartGantry,
  footBridge: buildFootBridge,
  videoScreen: buildVideoScreen,
  building: buildBuilding,
  hillsideLetters: buildHillsideLetters,
};
