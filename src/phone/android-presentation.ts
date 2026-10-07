interface FullscreenHost { requestFullscreen?(options?: FullscreenOptions): Promise<void> }
interface LandscapeScreen { lock?(orientation: 'landscape'): Promise<void> }

/** Fullscreen must be requested synchronously inside the user's first tap. */
export async function requestAndroidPresentation(userAgent: string, host: FullscreenHost, orientation: LandscapeScreen): Promise<void> {
  if (!/Android/i.test(userAgent) || !host.requestFullscreen) return;
  try {
    await host.requestFullscreen({ navigationUI: 'hide' });
    await orientation.lock?.('landscape');
  } catch {
    // A browser or user may decline either request; normal landscape play still works.
  }
}

export function installAndroidPresentation(host: HTMLElement): void {
  if (!/Android/i.test(navigator.userAgent)) return;
  host.addEventListener('pointerup', () => {
    void requestAndroidPresentation(navigator.userAgent, document.documentElement,
      screen.orientation as ScreenOrientation & LandscapeScreen);
  }, { once: true, passive: true });
}
