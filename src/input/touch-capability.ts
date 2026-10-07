/** WebKit can expose a coarse pointer without reporting maxTouchPoints. */
export function supportsTouchControls(maxTouchPoints: number, coarsePointer: boolean): boolean {
  return maxTouchPoints > 0 || coarsePointer;
}
