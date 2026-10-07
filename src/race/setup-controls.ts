import type { CarKind } from '@/car/car-specs';
import { getSetup, setSetup, stepSetup, type CarSetup } from '@/config/setup';
import type { InputManager } from '@/input/input-manager';

/** Live saved setup plus one half-percent bias step per deliberate button press. */
export function updateRaceSetup(car: CarKind, input: Pick<InputManager, 'consume'>, say: (text: string) => void): Readonly<CarSetup> {
  const rear = input.consume('brakeBiasRear'), front = input.consume('brakeBiasFront');
  let setup = getSetup(car);
  if (rear !== front) {
    setup = setSetup(car, stepSetup(car, setup, 'brakeBiasFront', front ? 1 : -1));
    say(`BRAKE BIAS ${(setup.brakeBiasFront * 100).toFixed(1)}% FRONT`);
  }
  return setup;
}
