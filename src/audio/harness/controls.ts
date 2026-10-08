import type { CarKind } from '@/car/car-specs';
import { CAR_SOUND_PROFILES } from '@/audio/dsp/engine-profile';
import { el, fmt } from '@/audio/harness/ui';
import type { CarAudioFrame, Surface } from '@/types/audio';

export interface ControlState {
  kind: CarKind;
  rpm: number;
  load: number;
  throttle: number;
  speedKmh: number;
  gear: number;
  slip: number;
  scrub: number;
  surface: Surface;
  interior: number;
  limiter: boolean;
  master: number;
  auto: boolean;
}

type NumKey = 'rpm' | 'load' | 'throttle' | 'speedKmh' | 'slip' | 'scrub' | 'interior' | 'master';

interface SliderDef {
  key: NumKey;
  label: string;
  min: number;
  max: number;
  step: number;
}

const SLIDERS: readonly SliderDef[] = [
  { key: 'rpm', label: 'rpm', min: 0, max: 8000, step: 10 },
  { key: 'load', label: 'load', min: 0, max: 1, step: 0.01 },
  { key: 'throttle', label: 'throttle', min: 0, max: 1, step: 0.01 },
  { key: 'speedKmh', label: 'speed km/h', min: 0, max: 320, step: 1 },
  { key: 'scrub', label: 'tyre scrub', min: 0, max: 1, step: 0.01 },
  { key: 'slip', label: 'slip', min: 0, max: 1, step: 0.01 },
  { key: 'interior', label: 'interior', min: 0, max: 1, step: 0.01 },
  { key: 'master', label: 'master', min: 0, max: 1.5, step: 0.01 },
];

export interface HarnessHandlers {
  start(): void;
  carChanged(kind: CarKind): void;
  shift(direction: 1 | -1): void;
  impact(energy: number): void;
  autoChanged(on: boolean): void;
  pause(paused: boolean): void;
  masterChanged(v: number): void;
  selfTest(): void;
}

export interface Controls {
  state: ControlState;
  root: HTMLElement;
  /** Reflect an auto-lap frame in the sliders without firing handlers. */
  sync(frame: CarAudioFrame): void;
  setStatus(text: string): void;
  setStartLabel(text: string): void;
}

export function initialState(kind: CarKind): ControlState {
  return {
    kind,
    rpm: CAR_SOUND_PROFILES[kind].idleRpm,
    load: 0.1,
    throttle: 0,
    speedKmh: 0,
    gear: 0,
    slip: 0,
    scrub: 0,
    surface: 'asphalt',
    interior: 0,
    limiter: false,
    master: 0.85,
    auto: false,
  };
}

function select<T extends string>(options: readonly T[], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = el('select');
  for (const o of options) s.append(el('option', { value: o, textContent: o }));
  s.value = value;
  s.addEventListener('change', () => onChange(s.value as T));
  return s;
}

export function buildControls(h: HarnessHandlers): Controls {
  const state = initialState('camaro');
  const outputs = new Map<NumKey, { input: HTMLInputElement; out: HTMLOutputElement }>();
  const status = el('div', { class: 'status', textContent: 'Audio not started.' });
  const startBtn = el('button', { class: 'primary', id: 'start', textContent: 'Start audio' });
  startBtn.addEventListener('click', () => h.start());

  const carSel = select<CarKind>(['camaro', 'mustang'], state.kind, (v) => {
    state.kind = v;
    if (!state.auto) state.rpm = CAR_SOUND_PROFILES[v].idleRpm;
    h.carChanged(v);
  });
  carSel.id = 'car';

  const root = el('aside');
  root.append(el('div', { class: 'btns' }, [startBtn, carSel]));

  for (const def of SLIDERS) {
    const input = el('input', { type: 'range', id: def.key, min: String(def.min), max: String(def.max), step: String(def.step) });
    input.value = String(state[def.key]);
    const out = el('output', { textContent: fmt(state[def.key], def.step < 1 ? 2 : 0) });
    input.addEventListener('input', () => {
      state[def.key] = Number(input.value);
      out.textContent = fmt(state[def.key], def.step < 1 ? 2 : 0);
      if (def.key === 'master') h.masterChanged(state.master);
    });
    outputs.set(def.key, { input, out });
    root.append(el('div', { class: 'row' }, [el('label', { htmlFor: def.key, textContent: def.label }), input, out]));
  }

  const gear = select(['0', '1', '2', '3', '4', '5', '6'] as const, '0', (v) => {
    state.gear = Number(v);
  });
  const surface = select<Surface>(['asphalt', 'kerb', 'gravel', 'grass'], 'asphalt', (v) => {
    state.surface = v;
  });
  const limiter = el('input', { type: 'checkbox', id: 'limiter' });
  limiter.addEventListener('change', () => {
    state.limiter = limiter.checked;
  });
  root.append(
    el('div', { class: 'row' }, [el('label', { textContent: 'gear' }), gear, el('span')]),
    el('div', { class: 'row' }, [el('label', { textContent: 'surface' }), surface, el('span')]),
    el('div', { class: 'row' }, [el('label', { htmlFor: 'limiter', textContent: 'limiter' }), limiter, el('span')]),
  );

  const up = el('button', { id: 'shift-up', textContent: 'Shift up' });
  up.addEventListener('click', () => {
    state.gear = Math.min(6, state.gear + 1);
    gear.value = String(state.gear);
    h.shift(1);
  });
  const down = el('button', { id: 'shift-down', textContent: 'Shift down' });
  down.addEventListener('click', () => {
    state.gear = Math.max(1, state.gear - 1);
    gear.value = String(state.gear);
    h.shift(-1);
  });
  const hit = (label: string, e: number): HTMLButtonElement => {
    const b = el('button', { textContent: label });
    b.addEventListener('click', () => h.impact(e));
    return b;
  };
  const auto = el('button', { id: 'auto', textContent: 'Auto lap: off' });
  auto.addEventListener('click', () => {
    state.auto = !state.auto;
    auto.textContent = `Auto lap: ${state.auto ? 'on' : 'off'}`;
    h.autoChanged(state.auto);
  });
  const pause = el('button', { id: 'pause', textContent: 'Pause audio' });
  let paused = false;
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? 'Resume audio' : 'Pause audio';
    h.pause(paused);
  });
  const selfTest = el('button', { textContent: 'Run self-test' });
  selfTest.addEventListener('click', () => h.selfTest());
  root.append(
    el('h2', { textContent: 'Events' }),
    el('div', { class: 'btns' }, [up, down, hit('Impact light', 0.25), hit('Impact heavy', 1)]),
    el('h2', { textContent: 'Simulated lap' }),
    el('div', { class: 'btns' }, [auto, pause, selfTest]),
    status,
  );

  return {
    state,
    root,
    sync(frame) {
      const values: Record<NumKey, number | undefined> = {
        rpm: frame.rpm,
        load: frame.load,
        throttle: frame.throttle,
        speedKmh: frame.speedKmh,
        slip: frame.slip,
        scrub: frame.scrub ?? 0,
        interior: frame.interior,
        master: undefined,
      };
      for (const [key, o] of outputs) {
        const v = values[key];
        if (v === undefined) continue;
        o.input.value = String(v);
        o.out.textContent = fmt(v, key === 'rpm' || key === 'speedKmh' ? 0 : 2);
      }
      gear.value = String(frame.gear);
      surface.value = frame.surface;
      limiter.checked = frame.onLimiter;
    },
    setStatus(text) {
      status.textContent = text;
    },
    setStartLabel(text) {
      startBtn.textContent = text;
    },
  };
}
