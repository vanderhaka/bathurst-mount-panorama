import type { CarSpec } from '@/car/car-specs';
import type { VehicleStint } from '@/physics/vehicle-stint';

/**
 * Profile inputs only, after tunedSpec; the Vehicle keeps its measured reference spec. tyreMu takes the
 * mean tyre grip and wheelGrip each tyre's share of it: a hot outside front limits its axle in a corner.
 */
export function stintSpec(spec: CarSpec, stint: VehicleStint): CarSpec {
  const tyre = stint.tyres.map((t, w) => t.grip * stint.flatSpots.tyres[w].gripMultiplier);
  const grip = tyre.reduce((sum, g) => sum + g, 0) / 4;
  const w = spec.wheelGrip ?? [1, 1, 1, 1];
  return {
    ...spec, massKg: stint.fuel.massKg(spec.massKg), tyreMu: spec.tyreMu * grip,
    wheelGrip: [w[0] * tyre[0] / grip, w[1] * tyre[1] / grip, w[2] * tyre[2] / grip, w[3] * tyre[3] / grip],
  };
}
