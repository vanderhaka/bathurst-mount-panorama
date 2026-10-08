// Audio harness: interactive car-sound rig plus an offline self-test (?selftest=1).
import { createCarAudioDebug, type CarAudioDebug } from '@/audio';
import { firingFrequencyHz } from '@/audio/dsp/firing';
import { buildControls, type Controls } from '@/audio/harness/controls';
import { LapSimulator } from '@/audio/harness/lap-trace';
import { drawLiveSpectrum, drawScope, type Marker } from '@/audio/harness/plots';
import { runSelfTest } from '@/audio/harness/selftest';
import { renderSelfTest } from '@/audio/harness/selftest-view';
import { canvas, el, injectStyles } from '@/audio/harness/ui';
import type { CarKind } from '@/car/car-specs';
import type { CarAudioFrame } from '@/types/audio';

interface ShotWindow {
  __shotReady?: boolean;
  __shotInfo?: unknown;
}
const shot = window as unknown as ShotWindow;

function header(title: string): { bar: HTMLElement; badge: HTMLElement } {
  const badge = el('span', { class: 'badge', textContent: 'idle' });
  return { bar: el('header', {}, [el('h1', { textContent: title }), badge]), badge };
}

async function runSelfTestPage(): Promise<void> {
  const { bar, badge } = header('Bathurst audio self-test (OfflineAudioContext)');
  const main = el('main', { class: 'wide' });
  document.body.append(bar, main);
  badge.textContent = 'running...';
  try {
    const art = await runSelfTest();
    badge.textContent = art.report.pass ? 'ALL CHECKS PASS' : 'CHECKS FAILED';
    badge.className = `badge ${art.report.pass ? 'ok' : 'bad'}`;
    renderSelfTest(main, art);
    shot.__shotInfo = art.report;
  } catch (e) {
    badge.textContent = 'ERROR';
    badge.className = 'badge bad';
    main.textContent = String(e);
    shot.__shotInfo = { error: String(e), stack: e instanceof Error ? e.stack : undefined };
  }
  shot.__shotReady = true;
}

function runInteractive(): void {
  const { bar, badge } = header('Bathurst car audio harness');
  const scope = canvas(900, 160, 'Oscilloscope');
  const spectrum = canvas(900, 320, 'Live spectrum');
  let ctx: AudioContext | null = null;
  let audio: CarAudioDebug | null = null;
  let lap = new LapSimulator('camaro');
  let lapT = 0;
  let pendingShift = false;
  let lapLabel = '';
  let last = performance.now();
  let controls: Controls;

  const switchCar = async (kind: CarKind): Promise<void> => {
    audio?.dispose();
    lap = new LapSimulator(kind);
    if (!ctx) return;
    audio = createCarAudioDebug(kind, ctx);
    await audio.start();
    audio.setMasterVolume(controls.state.master);
    if (audio.analyser) audio.analyser.fftSize = 8192;
  };

  controls = buildControls({
    async start() {
      ctx ??= new AudioContext({ latencyHint: 'interactive' });
      await ctx.resume();
      await switchCar(controls.state.kind);
      controls.setStartLabel('Audio running');
      badge.textContent = 'running';
      badge.className = 'badge ok';
    },
    carChanged: (k) => void switchCar(k),
    shift: () => {
      pendingShift = true;
    },
    impact: (e) => audio?.impact(e),
    autoChanged: (on) => {
      if (on) lapT = 0;
    },
    pause: (paused) => (paused ? audio?.suspend() : audio?.resume()),
    masterChanged: (v) => audio?.setMasterVolume(v),
    selfTest: () => {
      location.search = '?selftest=1';
    },
  });
  const plots = el('section', { class: 'plots' }, [
    el('h2', { textContent: 'Oscilloscope' }),
    scope,
    el('h2', { textContent: 'Spectrum (dashed: firing frequency, half-order)' }),
    spectrum,
  ]);
  document.body.append(bar, el('main', {}, [controls.root, plots]));

  const tick = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    last = now;
    const s = controls.state;
    let frame: CarAudioFrame;
    if (s.auto) {
      lapT += dt;
      const st = lap.step(lapT, dt, s.interior);
      frame = st.frame;
      lapLabel = st.label;
      controls.sync(frame);
    } else {
      lapLabel = '';
      frame = {
        rpm: s.rpm,
        load: s.load,
        throttle: s.throttle,
        speedKmh: s.speedKmh,
        gear: s.gear,
        onLimiter: s.limiter,
        slip: s.slip,
        scrub: s.scrub,
        surface: s.surface,
        interior: s.interior,
        shifted: pendingShift,
      };
    }
    pendingShift = false;
    if (audio?.ready) {
      audio.update(frame, dt);
      if (audio.analyser) {
        const fire = firingFrequencyHz(frame.rpm);
        const markers: Marker[] = [
          { hz: fire, label: `fire ${fire.toFixed(0)}`, color: '#7bd88f' },
          { hz: fire / 2, label: 'half', color: '#b48ead' },
        ];
        drawLiveSpectrum(spectrum, audio.analyser, markers);
        drawScope(scope, audio.analyser);
      }
      controls.setStatus(
        `engine: ${audio.engineMode}${audio.workletError ? ` (${audio.workletError})` : ''}\n` +
          `context: ${audio.context?.state} @ ${audio.context?.sampleRate} Hz\n` +
          `gear ${frame.gear}  rpm ${frame.rpm.toFixed(0)}  ${frame.speedKmh.toFixed(0)} km/h\n` +
          `${lapLabel ? `lap: ${lapLabel} (${(lapT % 110).toFixed(0)} s)` : ''}`,
      );
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  shot.__shotInfo = { mode: 'interactive' };
  shot.__shotReady = true;
}

injectStyles();
if (new URLSearchParams(location.search).get('selftest') === '1') void runSelfTestPage();
else runInteractive();
