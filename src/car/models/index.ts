// Public entry for the generated Gen3 car models.
import type { CreateCarModel } from '@/types/car-model';
import { buildCarModel } from '@/car/models/car-model';

/**
 * Builds a Camaro ZL1 or Mustang GT Gen3 Supercar from code (no assets).
 * Camera anchors are oriented like three.js cameras: copying an anchor's world
 * position and quaternion into a camera makes it look along the car's +Z.
 * Exhaust anchors point their local +Z along the exhaust flow.
 */
export const createCarModel: CreateCarModel = (kind, options) => buildCarModel(kind, options);

export { CAR_LOOK, applyCarLook, getCarLook, type CarLook, type CarLookPatch } from '@/car/models/look';
