import type { InputManager } from '@/input/input-manager';
import { touchControlsAvailable } from '@/input/touch-capability';
import { TouchControls } from '@/input/touch-controls';
import { touchOptions } from '@/input/touch-model';
import type { Settings } from '@/types/session';

/** Phone controls, and the browser events that pause a race the player can no longer drive:
 * the phone turns to portrait (index.html shows a turn-the-phone note) or the page is hidden
 * (app switch, lock, call). */
export function installDeviceHooks(root: HTMLElement, input: InputManager, settings: Settings, pauseRace: () => void): void {
  input.configureTouch(touchOptions(settings));
  if (touchControlsAvailable()) input.attachTouch(new TouchControls(root));
  matchMedia('(orientation: portrait) and (pointer: coarse)').addEventListener('change', (e) => { if (e.matches) pauseRace(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseRace(); });
}
