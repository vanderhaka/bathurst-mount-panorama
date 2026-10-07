// Phone and tablet guards: the game page must never zoom, scroll or open a long-press
// menu. iOS Safari ignores "user-scalable=no" for pinches, and two thumbs on the touch
// controls (steer and throttle) make a pinch, so the guards cancel Safari's gesture
// events and every multi-finger move, and reset the zoom if one still gets through.

const VIEWPORT = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

/** Safari returns to scale 1 when the viewport meta tag changes. */
function resetZoom(): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  meta.content = `${VIEWPORT}, minimum-scale=1`;
  requestAnimationFrame(() => {
    meta.content = VIEWPORT;
  });
}

export function installTouchGuards(root: HTMLElement): void {
  const cancel = (e: Event): void => e.preventDefault();
  const active = { passive: false } as const;
  // Safari-only pinch and rotate events (also a trackpad pinch in desktop Safari).
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(type, cancel, active);
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, active);
  document.addEventListener('dblclick', cancel, active);
  root.addEventListener('contextmenu', cancel);
  const vv = window.visualViewport;
  const check = (): void => { if (vv && vv.scale > 1.01) resetZoom(); };
  vv?.addEventListener('resize', check);
  vv?.addEventListener('scroll', check);
}
