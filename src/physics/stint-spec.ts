import type { CarSpec } from '@/car/car-specs';
import type { VehicleStint } from '@/physics/vehicle-stint';

/** Profile inputs only, after tunedSpec; the Vehicle keeps its measured reference spec. */
export function stintSpec(spec: CarSpec, stint: VehicleStint): CarSpec {
  const grip = stint.tyres.reduce((sum, tyre) => sum + tyre.grip, 0) / 4;
  return { ...spec, massKg: stint.fuel.massKg(spec.massKg), tyreMu: spec.tyreMu * grip };
}
