import type { MenuCallbacks } from '@/types/hud';

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

/** Android only, and only outside fullscreen. Call it synchronously inside a tap. */
function presentAndroid(): void {
  if (document.fullscreenElement) return;
  void requestAndroidPresentation(navigator.userAgent, document.documentElement,
    screen.orientation as ScreenOrientation & LandscapeScreen);
}

export function installAndroidPresentation(host: HTMLElement): void {
  if (!/Android/i.test(navigator.userAgent)) return;
  host.addEventListener('pointerup', presentAndroid, { once: true, passive: true });
}

/** Back or a notification can leave fullscreen mid-session: Start, Resume and Restart taps
 * request it again before the race continues. */
export function presentOnRaceTaps(callbacks: MenuCallbacks): MenuCallbacks {
  return {
    ...callbacks,
    onStart: (config) => { presentAndroid(); callbacks.onStart(config); },
    onResume: () => { presentAndroid(); callbacks.onResume(); },
    onRestart: () => { presentAndroid(); callbacks.onRestart(); },
  };
}
