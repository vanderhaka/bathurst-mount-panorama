// Single switch point for the car model implementation used by the game.
import { createCarModel as createGen3CarModel } from '@/car/models';
import type { CreateCarModel } from '@/types/car-model';

export const createCarModel: CreateCarModel = createGen3CarModel;
