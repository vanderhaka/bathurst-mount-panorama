/** WebKit can expose a coarse pointer without reporting maxTouchPoints. */
export function supportsTouchControls(maxTouchPoints: number, coarsePointer: boolean): boolean {
  return maxTouchPoints > 0 || coarsePointer;
}

/** This device: the one test for both the on-screen touch controls and the steering question. */
export function touchControlsAvailable(): boolean {
  return supportsTouchControls(navigator.maxTouchPoints, matchMedia('(pointer: coarse)').matches);
}
