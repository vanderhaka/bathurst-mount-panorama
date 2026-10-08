// Steering question model: who is asked, what is offered, what a choice saves and what
// is said when the phone will not give motion access. Pure (no DOM) so it can be unit-tested.
import { steerOnboarded } from '@/input/touch-model';
import type { TiltStatus } from '@/input/tilt-steering';
import type { Settings } from '@/types/session';

export type SteerChoice = 'drag' | 'tilt';

/** Finger is the existing drag mode; Tilt needs motion access. */
export const STEER_CHOICES: ReadonlyArray<{ mode: SteerChoice; label: string; help: string }> = [
  { mode: 'drag', label: 'Finger', help: 'Drag your thumb left or right on the left side of the screen.' },
  { mode: 'tilt', label: 'Tilt', help: 'Tilt the phone like a steering wheel.' },
];

/** Settings > Steering holds the Touch steering mode row. */
export const STEER_LATER = 'You can change this later in Settings > Steering.';
export const STEER_WAITING = 'Waiting for motion access…';

/** Touch screens only, and only until the player has chosen (or already changed the mode). */
export function needsSteerOnboarding(settings: Pick<Settings, 'touchMode' | 'steerOnboarded'>, touchDevice: boolean): boolean {
  return touchDevice && !steerOnboarded(settings);
}

export function withSteerChoice(settings: Settings, mode: SteerChoice): Settings {
  return { ...settings, touchMode: mode, steerOnboarded: true };
}

/** What to tell the player when Tilt did not work (Finger is used instead); null when it did. */
export function tiltFallbackNote(status: TiltStatus): string | null {
  if (status === 'granted') return null;
  const why = status === 'unavailable' ? 'Tilt is not available on this device' : 'Motion access is off';
  return `${why} — using Finger. Change it in Settings > Steering.`;
}
