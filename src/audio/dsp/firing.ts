/**
 * V8 firing geometry. A four-stroke V8 fires once every 90 degrees of crank
 * rotation, so one 720 degree engine cycle holds eight evenly spaced "slots".
 * Even slot spacing does NOT mean even exhaust spacing: a cross-plane V8 sends
 * the pulses of each cylinder bank to a different pipe, and within one bank the
 * gaps between consecutive pulses are uneven (3,2,1,2 slots). That per-bank
 * unevenness is what produces the lumpy "burble" of a cross-plane V8.
 */
export const SLOTS = 8;
export type Bank = 0 | 1;

export interface FiringLayout {
  /** Cylinder numbers (1-based) in firing order. */
  readonly firingOrder: readonly number[];
  /** Bank of each cylinder, index = cylinder number - 1. */
  readonly bankOfCylinder: readonly Bank[];
}

export interface FiringSlot {
  cylinder: number;
  bank: Bank;
  /** Slots since the previous firing of the same bank (1..7). */
  gapSlots: number;
}

/** Chevrolet small-block / LS order 1-8-4-3-6-5-7-2, odd cylinders on one bank. */
export const CHEVY_LAYOUT: FiringLayout = {
  firingOrder: [1, 8, 4, 3, 6, 5, 7, 2],
  bankOfCylinder: [0, 1, 0, 1, 0, 1, 0, 1],
};

/** Ford 1-5-4-8-6-3-7-2, cylinders 1-4 on one bank, 5-8 on the other. */
export const FORD_LAYOUT: FiringLayout = {
  firingOrder: [1, 5, 4, 8, 6, 3, 7, 2],
  bankOfCylinder: [0, 0, 0, 0, 1, 1, 1, 1],
};

/** Toyota / Lexus UR (2UR-GSE) 1-8-7-3-6-5-4-2, odd cylinders on one bank. */
export const TOYOTA_LAYOUT: FiringLayout = {
  firingOrder: [1, 8, 7, 3, 6, 5, 4, 2],
  bankOfCylinder: [0, 1, 0, 1, 0, 1, 0, 1],
};

/** Flat-plane V8 alternates banks, every bank gap is exactly two slots. */
export const FLAT_PLANE_LAYOUT: FiringLayout = {
  firingOrder: [1, 5, 3, 7, 4, 8, 2, 6],
  bankOfCylinder: [0, 0, 0, 0, 1, 1, 1, 1],
};

/** Firing frequency of a V8 (4 pulses per revolution), Hz. */
export function firingFrequencyHz(rpm: number): number {
  return (rpm / 60) * 4;
}

/** Frequency of the 720 degree engine cycle (half the rev rate), Hz. */
export function cycleFrequencyHz(rpm: number): number {
  return rpm / 120;
}

export function buildFiringSlots(layout: FiringLayout): FiringSlot[] {
  const banks = layout.firingOrder.map((c) => layout.bankOfCylinder[c - 1]);
  return layout.firingOrder.map((cylinder, i) => {
    const bank = banks[i];
    let gap = SLOTS;
    for (let k = 1; k <= SLOTS; k++) {
      if (banks[(i - k + SLOTS) % SLOTS] === bank) {
        gap = k;
        break;
      }
    }
    return { cylinder, bank, gapSlots: gap };
  });
}

/** Gaps (in slots) between consecutive pulses of one bank, in firing order. */
export function bankGaps(slots: readonly FiringSlot[], bank: Bank): number[] {
  return slots.filter((s) => s.bank === bank).map((s) => s.gapSlots);
}
