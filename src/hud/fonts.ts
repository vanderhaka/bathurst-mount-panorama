// Self-hosted fonts for the HUD and menus (bundled by Vite, no CDN).
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/jetbrains-mono/500.css';

/** Font faces to await before a screenshot or first render. */
export const HUD_FONT_FACES = [
  '500 16px "Barlow Condensed"',
  '600 16px "Barlow Condensed"',
  '700 16px "Barlow Condensed"',
  '800 16px "Barlow Condensed"',
  '400 16px "Barlow"',
  '500 16px "Barlow"',
  '600 16px "Barlow"',
  '500 16px "JetBrains Mono"',
] as const;

/** Resolves once every HUD font face is loaded (never rejects). */
export async function loadHudFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.all(HUD_FONT_FACES.map((f) => document.fonts.load(f).catch(() => [])));
}
