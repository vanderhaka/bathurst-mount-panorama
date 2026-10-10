// In-race HUD. createHud() implements the Hud contract (src/types/hud.ts).
// Look is driven by CSS custom properties in ./theme.css; setHudScale /
// setHudOpacity change them live for a tuning panel.
import '@/hud/fonts';
import '@/hud/theme.css';
import '@/hud/hud.css';
import '@/hud/timing.css';
import '@/hud/dash.css';
import '@/hud/map.css';
import '@/hud/broadcast.css';
import '@/hud/phone.css';
import '@/hud/minimal.css';
import type { Hud, HudState, HudTrackInfo } from '@/types/hud';
import { Banner } from '@/hud/banner';
import { Dash } from '@/hud/dash';
import { DeltaStrip } from '@/hud/delta-strip';
import { h, TextSlot } from '@/hud/dom';
import { MinimalReadout } from '@/hud/minimal-readout';
import { StartLights } from '@/hud/start-lights';
import { Telemetry } from '@/hud/telemetry';
import { TimingPanel } from '@/hud/timing-panel';
import { TrackMap } from '@/hud/track-map';
import { TyreFuelPanel } from '@/hud/tyre-fuel-panel';

export { loadHudFonts } from '@/hud/fonts';

interface Parts {
  root: HTMLElement;
  timing: TimingPanel;
  minimal: MinimalReadout;
  map: TrackMap;
  dash: Dash;
  telemetry: Telemetry;
  tyreFuel: TyreFuelPanel;
  delta: DeltaStrip;
  lights: StartLights;
  banner: Banner;
  fps: TextSlot;
  shootout: TextSlot;
}

function build(track: HudTrackInfo): Parts {
  const timing = new TimingPanel(track.city);
  const minimal = new MinimalReadout();
  const map = new TrackMap(track);
  const dash = new Dash(track);
  const telemetry = new Telemetry();
  const tyreFuel = new TyreFuelPanel();
  const delta = new DeltaStrip();
  const lights = new StartLights();
  const banner = new Banner();
  const fps = new TextSlot(h('span', 'hud-fps', { 'data-on': 'false' }));
  const shootout = new TextSlot(h('div', 'hud-shootout', { hidden: true, 'aria-live': 'polite' }));
  const root = h('div', 'bx-hud', { 'data-visible': 'true' }, [
    h('div', 'hud-region hud-region--tl', undefined, [timing.el, fps.el]),
    h('div', 'hud-region hud-region--tr', undefined, [map.el]),
    h('div', 'hud-region hud-region--tc', undefined, [lights.el, delta.el, banner.el]),
    h('div', 'hud-region hud-region--bl', undefined, [tyreFuel.el, telemetry.el]),
    h('div', 'hud-region hud-region--br', undefined, [dash.el]),
    minimal.el,
    shootout.el,
  ]);
  return { root, timing, minimal, map, dash, telemetry, tyreFuel, delta, lights, banner, fps, shootout };
}

/** Creates the HUD. The container must cover the game viewport; it is made position:relative if static. */
export function createHud(): Hud {
  let parts: Parts | null = null;
  let visible = true;
  let fpsShown = -1;
  return {
    mount(container: HTMLElement, track: HudTrackInfo): void {
      if (parts) parts.root.remove();
      if (container !== document.body && getComputedStyle(container).position === 'static') container.style.position = 'relative';
      parts = build(track);
      parts.root.dataset.visible = visible ? 'true' : 'false';
      container.append(parts.root);
    },
    update(state: HudState): void {
      if (!parts) return;
      // The display-only tyre/fuel estimate integrates over time, so it keeps running while hidden.
      parts.tyreFuel.update(state);
      if (!visible) return;
      const size = state.hudSize === 'minimal' ? 'minimal' : 'full';
      if (parts.root.dataset.size !== size) parts.root.dataset.size = size;
      parts.minimal.update(state);
      const view = state.view ?? 'outside';
      if (parts.root.dataset.view !== view) parts.root.dataset.view = view;
      parts.timing.update(state);
      parts.delta.update(state);
      parts.lights.update(state);
      parts.map.update(state);
      parts.dash.update(state);
      parts.telemetry.update(state);
      parts.banner.update(state);
      if (state.shootout) parts.shootout.el.removeAttribute('hidden');
      else parts.shootout.el.setAttribute('hidden', '');
      if (state.shootout) {
        const s = state.shootout;
        const mode = s.mode === 'shootoutTop10' ? 'TOP 10' : 'ARCADE';
        const phase = s.phase === 'warmup' ? 'WARM-UP · Timed lap starts at the line' : s.phase === 'ready' ? 'Starting timed lap' : 'SHOOTOUT LAP';
        const quota = s.mode === 'shootoutTop10' ? s.attempt ? `Attempt ${s.attempt}/3 · ${s.remaining} left` : `${s.remaining} attempts left · Warm-up is free` : 'Unlimited practice · No official score';
        parts.shootout.set(`${mode} · ${phase} · ${quota}`);
      }
      const fps = state.fps === null ? -1 : Math.round(state.fps);
      if (fps !== fpsShown) {
        fpsShown = fps;
        parts.fps.el.setAttribute('data-on', fps < 0 ? 'false' : 'true');
        parts.fps.set(fps < 0 ? '' : `${fps} FPS`);
      }
    },
    setVisible(v: boolean): void {
      visible = v;
      if (parts) parts.root.dataset.visible = v ? 'true' : 'false';
    },
    dispose(): void {
      parts?.map.dispose();
      parts?.root.remove();
      parts = null;
    },
  };
}

/** In-race HUD size multiplier (1 = default), clamped to 0.5..2. Menus scale with --menu-scale. */
export function setHudScale(scale: number): void {
  const v = Number.isFinite(scale) ? Math.max(0.5, Math.min(2, scale)) : 1;
  document.documentElement.style.setProperty('--hud-scale', String(v));
}

/** Overall HUD opacity 0..1 (menus are unaffected). */
export function setHudOpacity(opacity: number): void {
  const v = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
  document.documentElement.style.setProperty('--hud-opacity', String(v));
}
