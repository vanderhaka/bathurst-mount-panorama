// DOM menus. createMenus() implements the Menus contract (src/types/hud.ts).
// While a menu is open it owns the keyboard: a window capture listener handles
// arrows / WASD / Enter / Space / Esc / Backspace / Q / E and stops their propagation.
// Every other key (e.g. T for the tuner) passes through. Gamepad input arrives via nav().
// Left / right change a value row, else move to the item beside; LB / RB change the tab.
import '@/hud/fonts';
import '@/hud/theme.css';
import '@/ui/menus.css';
import '@/ui/glyphs.css';
import '@/ui/screens.css';
import '@/ui/screens-panels.css';
import '@/ui/tabs.css';
import '@/ui/phone.css';
import '@/ui/telemetry.css';
import '@/ui/shootout.css';
import { CAR_SPECS, type CarKind } from '@/car/car-specs';
import { LIVERY_PRESETS, liveryNumber } from '@/car/liveries';
import { h } from '@/hud/dom';
import type { PadStyle } from '@/input/pad-style';
import type { MenuCallbacks, MenuNav, Menus } from '@/types/hud';
import type { DrivingLevel, LapRecord, RaceMode, SessionConfig, Settings, ShootoutMode } from '@/types/session';
import type { ShootoutAttempt, ShootoutOutcome } from '@/shootout/model';
import { ShootoutStore } from '@/shootout/store';
import type { PracticeSummary } from '@/game/arcade-best';
import type { TyreCompound } from '@/physics/tyre-state';
import { LIVERY_COUNT } from '@/ui/car-data';
import { applyPadStyle } from '@/ui/pad-glyphs';
import { adjust, itemBeside, type Screen } from '@/ui/screen';
import { CarSelectScreen } from '@/ui/screens/car-select';
import { ControlsScreen } from '@/ui/screens/controls';
import { LoadingScreen } from '@/ui/screens/loading';
import { OnboardingScreen } from '@/ui/screens/onboarding';
import { PauseScreen } from '@/ui/screens/pause';
import { ResultsScreen } from '@/ui/screens/results';
import { SettingsScreen } from '@/ui/screens/settings';
import { SteerOnboardingScreen } from '@/ui/screens/steer-onboarding';
import { TitleScreen } from '@/ui/screens/title';
import { TelemetryScreen } from '@/ui/screens/telemetry';
import { ShootoutScreen } from '@/ui/screens/shootout';
import { ShootoutResultScreen } from '@/ui/screens/shootout-result';
import { ACTIVE_CIRCUIT, CIRCUITS } from '@/track/circuits';

const KEYS: Record<string, MenuNav> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  Enter: 'accept',
  NumpadEnter: 'accept',
  Space: 'accept',
  Escape: 'back',
  Backspace: 'back',
  KeyQ: 'prevTab',
  KeyE: 'nextTab',
  PageUp: 'prevTab',
  PageDown: 'nextTab',
};

interface ScreenSet {
  loading: LoadingScreen;
  title: TitleScreen;
  car: CarSelectScreen;
  onboarding: OnboardingScreen;
  steer: SteerOnboardingScreen;
  settings: SettingsScreen;
  pause: PauseScreen;
  controls: ControlsScreen;
  results: ResultsScreen;
  telemetry: TelemetryScreen;
  shootout: ShootoutScreen;
  shootoutResult: ShootoutResultScreen;
}

class MenuController implements Menus {
  readonly liveryCount = LIVERY_COUNT;
  private root: HTMLElement | null = null;
  private screens: ScreenSet | null = null;
  private current: Screen | null = null;
  private returnTo: Screen | null = null;
  private openedAt = 0;
  private settings!: Settings;
  private cb!: MenuCallbacks;
  private lastConfig: SessionConfig | null = null;
  private readonly lastFocus = new WeakMap<Screen, HTMLElement>();
  private padStyle: PadStyle = 'xbox';
  private mode: RaceMode = 'timeTrial';
  private readonly shootoutStore = new ShootoutStore();

  mount(container: HTMLElement, callbacks: MenuCallbacks, initial: Settings): void {
    this.dispose();
    this.cb = callbacks;
    this.settings = { ...initial };
    if (container !== document.body && getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const sub = (s: Screen): void => {
      this.returnTo = this.current;
      this.show(s);
    };
    const backFromSub = (): void => (this.returnTo ? this.show(this.returnTo) : this.showTitle());
    const screens: ScreenSet = {
      loading: new LoadingScreen(),
      title: new TitleScreen({ race: () => { this.mode = 'timeTrial'; this.showCarSelect(); }, shootout: mode => this.showShootout(mode), settings: () => sub(screens.settings), controls: () => sub(screens.controls) },
        () => new Set(this.shootoutStore.snapshot().attempts.map(a => a.attempt.id))),
      car: new CarSelectScreen({ preview: (c, l) => this.cb.onPreviewCar(c, l), start: (c, l, t) => this.start(c, l, t), back: () => this.mode === 'timeTrial' ? this.showTitle() : this.showShootout(this.mode) }),
      onboarding: new OnboardingScreen({ get: () => this.settings, set: (s) => this.applySettings(s), back: () => this.showCarSelect() }),
      steer: new SteerOnboardingScreen({ get: () => this.settings, set: (s) => this.applySettings(s), enableTilt: () => this.cb.onEnableTilt?.() ?? Promise.resolve('unavailable'), back: () => this.showCarSelect() }),
      settings: new SettingsScreen({ get: () => this.settings, set: (s) => this.applySettings(s), back: backFromSub, toggleTuner: () => this.cb.onToggleTuner(), car: () => this.lastConfig?.car ?? 'camaro' }),
      pause: new PauseScreen({
        resume: () => this.leave(() => this.cb.onResume()),
        restart: () => this.leave(() => this.cb.onRestart()),
        resetCar: () => this.leave(() => this.cb.onResetCar()),
        settings: () => sub(screens.settings),
        controls: () => sub(screens.controls),
        results: () => this.cb.onResults?.(),
        telemetry: () => sub(screens.telemetry),
        quit: () => {
          this.showTitle();
          this.cb.onQuitToMenu();
        },
        session: () => this.sessionLine(),
      }),
      controls: new ControlsScreen(backFromSub),
      results: new ResultsScreen({
        again: () => this.leave(() => this.cb.onRestart()),
        // The paused race ends first (records saved, HUD and cars removed), then car select.
        changeCar: () => { this.cb.onQuitToMenu(); this.showCarSelect(); },
        menu: () => (this.showTitle(), this.cb.onQuitToMenu()),
        telemetry: () => sub(screens.telemetry),
        backToSession: () => this.showPause(),
      }),
      telemetry: new TelemetryScreen(() => this.cb.telemetry?.() ?? null, backFromSub, () => this.settings.units),
      shootout: new ShootoutScreen(this.shootoutStore, {
        start: () => this.showCarSelect(),
        arcade: () => this.showShootout('shootoutArcade'),
        resume: saved => { if (saved.outcome) this.showShootoutResult('shootoutTop10', saved.attempt, saved.outcome); },
        back: () => this.showTitle(),
      }),
      shootoutResult: new ShootoutResultScreen(this.shootoutStore, {
        again: () => { this.cb.onQuitToMenu(); this.showCarSelect(); },
        leaderboard: () => { this.cb.onQuitToMenu(); this.showShootout('shootoutTop10'); },
        menu: () => { this.cb.onQuitToMenu(); this.showTitle(); },
      }),
    };
    this.screens = screens;
    this.root = h('div', 'bx-menus', { 'data-open': 'false' }, Object.values(screens).map((s: Screen) => s.el));
    this.root.addEventListener('focusin', this.onFocusIn);
    this.root.addEventListener('pointerover', this.onPointer);
    container.append(this.root);
    window.addEventListener('keydown', this.onKey, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    this.cb.onSettingsChange({ ...s });
  }

  private start(car: CarKind, liveryIndex: number, tyres: TyreCompound): void {
    const go = (): void => {
      const config: SessionConfig = { car, liveryIndex, tyres, settings: { ...this.settings }, ...(this.mode === 'timeTrial' ? {} : { mode: this.mode }) };
      this.lastConfig = config;
      this.leave(() => this.cb.onStart(config));
    };
    // First race setup (everyone, once; it opens on its selected card, not a remembered button), then the steering question (touch players, once).
    const { steer, onboarding } = this.screens ?? {};
    const shootout = this.mode !== 'timeTrial';
    const steerThenGo = (): void => { if (steer?.required(this.settings, shootout)) { steer.ask(go); this.show(steer); } else go(); };
    if (!shootout && onboarding?.required(this.settings)) { onboarding.ask(steerThenGo, steer?.required(this.settings) ? 'Continue' : 'Start'); this.lastFocus.delete(onboarding); this.show(onboarding); } else steerThenGo();
  }

  /** Close the menus, then notify the game (which may open another screen). */
  private leave(notify: () => void): void {
    this.hide();
    notify();
  }

  private sessionLine(): string {
    if (!this.lastConfig) return `${CIRCUITS[ACTIVE_CIRCUIT].name} · Practice`;
    const preset = LIVERY_PRESETS[this.lastConfig.car][this.lastConfig.liveryIndex];
    return `${CAR_SPECS[this.lastConfig.car].shortName} · #${preset ? liveryNumber(preset.livery) : ''} ${preset?.name ?? ''}`.trim();
  }

  private show(screen: Screen): void {
    if (!this.root || !this.screens) return;
    const prev = this.current;
    if (prev && prev !== screen) prev.onHide?.();
    if (prev && prev !== screen && document.activeElement instanceof HTMLElement && prev.el.contains(document.activeElement)) {
      this.lastFocus.set(prev, document.activeElement);
    }
    for (const s of Object.values(this.screens) as Screen[]) s.el.hidden = s !== screen;
    this.root.dataset.open = 'true';
    this.root.dataset.screen = screen.id;
    this.current = screen;
    this.openedAt = performance.now();
    screen.onShow?.();
    const items = screen.items();
    const remembered = this.lastFocus.get(screen);
    this.focus(remembered && items.includes(remembered) ? remembered : items[0]);
  }

  private focus(el: HTMLElement | undefined): void {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }

  private readonly onFocusIn = (e: FocusEvent): void => {
    this.root?.querySelectorAll('.is-focus').forEach((el) => el.classList.remove('is-focus'));
    const t = e.target as HTMLElement;
    if (t.classList.contains('mn-item')) t.classList.add('is-focus');
  };

  private readonly onPointer = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return;
    const item = (e.target as HTMLElement).closest<HTMLElement>('.mn-item');
    if (item && item !== document.activeElement && this.current?.items().includes(item)) item.focus({ preventScroll: true });
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this.current || this.current.id === 'loading') return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      if (!this.root?.contains(target)) return;
      if (e.code !== 'Escape') { e.stopPropagation(); return; }
    }
    const action = KEYS[e.code];
    if (!action || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.timeStamp < this.openedAt) return;
    if ((action === 'accept' || action === 'back') && e.repeat) return;
    this.nav(action);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return;
    if (this.current && KEYS[e.code]) e.preventDefault();
  };

  nav(action: MenuNav): void {
    const screen = this.current;
    if (!screen) return;
    if (action === 'back') return screen.back();
    if (action === 'prevTab' || action === 'nextTab') {
      if (!screen.tab) return;
      screen.tab(action === 'prevTab' ? -1 : 1);
      return this.focus(screen.items()[0]);
    }
    const items = screen.items();
    if (items.length === 0) return;
    let idx = items.indexOf(document.activeElement as HTMLElement);
    if (idx < 0) return this.focus(items[0]);
    if (action === 'accept') return items[idx].click();
    if (action === 'left' || action === 'right') {
      const dir = action === 'left' ? -1 : 1;
      if (adjust(items[idx], dir)) return;
      const beside = itemBeside(items, items[idx], dir);
      if (beside) this.focus(beside);
      return;
    }
    idx = action === 'up' ? (idx - 1 + items.length) % items.length : (idx + 1) % items.length;
    this.focus(items[idx]);
  }

  showLoading(progress: number, label: string): void {
    if (!this.screens) return;
    this.screens.loading.set(progress, label);
    if (this.current !== this.screens.loading) this.show(this.screens.loading);
  }

  showTitle(): void {
    if (this.screens) this.show(this.screens.title);
  }

  showCarSelect(): void {
    if (!this.screens) return;
    this.screens.car.setMode(this.mode, this.mode === 'shootoutTop10' ? this.shootoutStore.snapshot().remaining : 3);
    this.show(this.screens.car);
  }

  showShootout(mode: ShootoutMode): void {
    if (!this.screens || ACTIVE_CIRCUIT !== 'bathurst') return;
    this.mode = mode;
    this.screens.shootout.setMode(mode);
    this.show(this.screens.shootout);
  }

  showShootoutResult(mode: ShootoutMode, attempt: ShootoutAttempt | null, outcome: ShootoutOutcome, error?: string, practice?: PracticeSummary): void {
    if (!this.screens) return;
    this.mode = mode;
    this.screens.shootoutResult.set(mode, attempt, outcome, practice);
    if (error) this.screens.shootoutResult.showError(error);
    this.show(this.screens.shootoutResult);
  }

  showPause(shootout?: { mode: ShootoutMode; timed: boolean; grid?: boolean }): void {
    if (!this.screens) return;
    this.screens.pause.setShootout(shootout);
    this.show(this.screens.pause);
  }

  syncSettings(s: Settings): void {
    this.settings = { ...s };
  }

  setPadStyle(style: PadStyle): void {
    if (!this.root || !this.screens || style === this.padStyle) return;
    this.padStyle = style;
    this.screens.controls.setPadStyle(style);
    applyPadStyle(this.root, style);
  }

  showResults(laps: LapRecord[], bestByCar: Partial<Record<CarKind, LapRecord>>, level?: DrivingLevel): void {
    if (!this.screens) return;
    this.screens.results.setSessionReturn(this.current === this.screens.pause);
    this.screens.results.set(laps, bestByCar, level);
    this.show(this.screens.results);
  }

  hide(): void {
    if (!this.root || !this.screens) return;
    this.current?.onHide?.();
    for (const s of Object.values(this.screens) as Screen[]) s.el.hidden = true;
    this.root.dataset.open = 'false';
    this.current = null;
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
  }

  isOpen(): boolean {
    return this.current !== null;
  }

  dispose(): void {
    this.current?.onHide?.();
    window.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.root?.remove();
    this.root = null;
    this.screens = null;
    this.current = null;
  }
}

export function createMenus(): Menus {
  return new MenuController();
}
