import { drawSpectra, drawSpectrogram } from '@/audio/harness/plots';
import type { SelfTestArtifacts } from '@/audio/harness/selftest';
import { canvas, el, fmt } from '@/audio/harness/ui';

function cell(text: string, ok?: boolean): HTMLTableCellElement {
  return el('td', { textContent: text, class: ok === undefined ? '' : ok ? 'ok' : 'bad' });
}

function table(head: string[], rows: Array<Array<HTMLTableCellElement | string>>): HTMLTableElement {
  const t = el('table');
  t.append(el('thead', {}, [el('tr', {}, head.map((h) => el('th', { textContent: h })))]));
  t.append(
    el(
      'tbody',
      {},
      rows.map((r) => el('tr', {}, r.map((c) => (typeof c === 'string' ? cell(c) : c)))),
    ),
  );
  return t;
}

/** Render the self-test report as tables plus spectrum and spectrogram evidence. */
export function renderSelfTest(root: HTMLElement, a: SelfTestArtifacts): void {
  const r = a.report;
  const yn = (ok: boolean): string => (ok ? 'PASS' : 'FAIL');
  const left = el('aside');
  left.append(
    el('h2', { textContent: `Steady-state engine (${r.engineMode} engine, 48 kHz, 2 s)` }),
    table(
      ['car', 'rpm', 'fire Hz', 'peak Hz', 'on', 'err %', 'fire dB', 'half dB', 'pk dBFS', 'rms dBFS', 'cent Hz', ''],
      r.runs.map((x) => [
        x.kind,
        String(x.rpm),
        fmt(x.fireHz, 1),
        fmt(x.dominantHz, 1),
        x.matches ?? 'none',
        fmt(x.matchErrPct, 3),
        fmt(x.fireDb, 1),
        fmt(x.halfOrderDb, 1),
        fmt(x.peakDbfs, 1),
        fmt(x.rmsDbfs, 1),
        fmt(x.centroidHz, 0),
        cell(yn(x.ok), x.ok),
      ]),
    ),
    el('h2', { textContent: 'Camaro vs Mustang @ 4500 rpm' }),
    table(
      ['1/3-oct RMS diff dB', 'Camaro centroid', 'Mustang centroid', 'ratio', ''],
      [[fmt(r.comparison.bandDistanceDb, 2), fmt(r.comparison.centroidCamaro, 0), fmt(r.comparison.centroidMustang, 0), fmt(r.comparison.centroidRatio, 2), cell(yn(r.comparison.differ), r.comparison.differ)]],
    ),
    el('h2', { textContent: 'Pitch tracking (fire 4500 / fire 3000 = 1.5) and tone vs load' }),
    table(
      ['car', 'ratio', 'throttle centroid', 'overrun centroid', ''],
      r.pitchTracking.map((p, i) => [p.kind, fmt(p.ratioFire, 4), fmt(r.brightness[i].throttleCentroid, 0), fmt(r.brightness[i].overrunCentroid, 0), cell(yn(p.ok && r.brightness[i].ok), p.ok && r.brightness[i].ok)]),
    ),
    el('h2', { textContent: 'Full mix levels (150 km/h, slip 0.6) and worst case (limiter + kerb + slide + impact)' }),
    table(
      ['car', 'mix pk', 'mix rms', 'worst pk', 'worst rms', ''],
      r.levels.map((l) => [l.kind, fmt(l.fullMix.peakDbfs, 1), fmt(l.fullMix.rmsDbfs, 1), fmt(l.worst.peakDbfs, 2), fmt(l.worst.rmsDbfs, 1), cell(yn(l.fullMix.ok && l.worst.ok), l.fullMix.ok && l.worst.ok)]),
    ),
    el('h2', { textContent: 'Events: overrun pops, shift crack, impact, limiter stutter' }),
    table(
      ['car', 'pop wins', 'shift dB', 'impact dB', 'lim std', 'base std', ''],
      r.overrun.map((o, i) => [o.kind, String(o.popWindows), fmt(r.events[i].shiftRiseDb, 1), fmt(r.events[i].impactRiseDb, 1), fmt(r.events[i].limiterStutterDb, 2), fmt(r.events[i].baselineStutterDb, 2), cell(yn(o.ok && r.events[i].ok), o.ok && r.events[i].ok)]),
    ),
    el('h2', { textContent: 'Fallback engine (oscillator + WaveShaper), cockpit mix, API lifecycle' }),
    table(
      ['fallback fire dB', 'fallback peak Hz', 'fallback rms', 'intake/exhaust @ interior=1', 'lifecycle', ''],
      [[fmt(r.fallback?.fireDb ?? NaN, 1), fmt(r.fallback?.dominantHz ?? NaN, 1), fmt(r.fallback?.rmsDbfs ?? NaN, 1), fmt(r.interiorMix.intakeOverExhaust, 2), r.lifecycle.ok ? 'ok' : r.lifecycle.detail, cell(yn((r.fallback?.ok ?? false) && r.interiorMix.ok && r.lifecycle.ok), (r.fallback?.ok ?? false) && r.interiorMix.ok && r.lifecycle.ok)]],
    ),
  );

  const right = el('section', { class: 'plots' });
  const at = (k: string, rpm: number) => a.spectra.find((s) => s.kind === k && s.rpm === rpm);
  const c1 = canvas(740, 215, 'Spectra at 4500 rpm');
  const c2 = canvas(740, 215, 'Spectra at 3000 rpm');
  const c3 = canvas(740, 190, 'Camaro overrun spectrogram');
  right.append(
    el('h2', { textContent: '4500 rpm spectra (amber Camaro, blue Mustang); dashed = firing (300 Hz) and half-order (150 Hz)' }),
    c1,
    el('h2', { textContent: '3000 rpm spectra; dashed = firing (200 Hz) and half-order (100 Hz)' }),
    c2,
    el('h2', { textContent: 'Camaro lift-off at 6600 rpm (0.6 s): bang, then decaying pops, 0 to 6 kHz' }),
    c3,
  );
  root.append(left, right);
  const series = (rpm: number) =>
    (['camaro', 'mustang'] as const).flatMap((k) => {
      const s = at(k, rpm);
      return s ? [{ label: k, color: k === 'camaro' ? '#f2a65a' : '#6cb6ff', spectrum: s.spectrum }] : [];
    });
  drawSpectra(c1, series(4500), [
    { hz: 300, label: 'fire 300', color: '#7bd88f' },
    { hz: 150, label: 'half 150', color: '#b48ead' },
  ]);
  drawSpectra(c2, series(3000), [
    { hz: 200, label: 'fire 200', color: '#7bd88f' },
    { hz: 100, label: 'half 100', color: '#b48ead' },
  ]);
  if (a.overrunSamples) drawSpectrogram(c3, a.overrunSamples, 48000);
}
