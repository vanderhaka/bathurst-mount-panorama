import { h } from '@/hud/dom';
import { formatLapTime, type SpeedUnits } from '@/hud/format';
import { compareLaps } from '@/race/telemetry-compare';
import type { LapTelemetry, SessionTelemetry } from '@/types/telemetry';
import { hintBar, kicker, menuButton, screenEl, STD_HINTS, valueRow, type Screen } from '@/ui/screen';
import { telemetryChart } from '@/ui/telemetry-chart';

const deltaText = (ms: number): string => `${ms < 0 ? '-' : '+'}${(Math.abs(ms) / 1000).toFixed(3)}`;
const deltaClass = (ms: number): string => ms < 0 ? 'is-faster' : ms > 0 ? 'is-slower' : '';
const lapLabel = (lap: LapTelemetry): string => `Lap ${lap.lapNumber} · ${formatLapTime(lap.timeS)}${lap.valid ? '' : ' · Invalid'}`;

interface Reference { name: string; lap: LapTelemetry }

export class TelemetryScreen implements Screen {
  readonly id = 'telemetry' as const;
  readonly el = screenEl('telemetry', 'Lap telemetry', 'mn-screen--dim');
  private readonly summary = h('p', 'mn-results__summary');
  private readonly body = h('div', 'mn-telemetry__body');
  private readonly lapRow = valueRow('Lap to inspect', (dir) => this.changeLap(dir));
  private readonly referenceRow = valueRow('Compare with', (dir) => this.changeReference(dir));
  private readonly done: HTMLButtonElement;
  /** Charts and corner rows: focus stops, so up / down (D-pad) scroll the whole body into view. */
  private stops: HTMLElement[] = [];
  private data: SessionTelemetry | null = null;
  private lapIndex = 0;
  private referenceIndex = 0;

  constructor(private readonly read: () => SessionTelemetry | null, back: () => void, private readonly units: () => SpeedUnits) {
    this.done = menuButton('Back', back);
    this.el.append(
      h('div', 'mn-panel mn-panel--telemetry', undefined, [
        h('header', 'mn-panel__head', undefined, [kicker('Session'), h('h2', 'mn-h2', undefined, ['Telemetry']), this.summary]),
        h('div', 'mn-telemetry__selectors', undefined, [this.lapRow.el, this.referenceRow.el]),
        this.body,
        h('footer', 'mn-panel__foot', undefined, [h('p', 'mn-help', undefined, ['Negative = time gained · Positive = time lost']), this.done]),
      ]), hintBar(STD_HINTS),
    );
  }

  items(): HTMLElement[] { return [this.lapRow.el, this.referenceRow.el, ...this.stops, this.done]; }
  back(): void { this.done.click(); }

  onShow(): void {
    this.data = this.read();
    this.lapIndex = Math.max(0, (this.data?.laps.length ?? 0) - 1);
    this.referenceIndex = 0;
    this.render();
  }

  private changeLap(dir: -1 | 1): void {
    const count = this.data?.laps.length ?? 0;
    if (count < 1) return;
    this.lapIndex = (this.lapIndex + dir + count) % count;
    this.referenceIndex = 0;
    this.render();
  }

  private references(lap: LapTelemetry): Reference[] {
    const data = this.data!;
    const refs: Reference[] = [];
    if (data.best && data.best !== lap) refs.push({ name: 'Best lap', lap: data.best });
    if (data.ghost && data.ghost !== lap) refs.push({ name: 'Ghost', lap: data.ghost });
    for (const other of [...data.laps].reverse()) if (other !== lap) refs.push({ name: `Lap ${other.lapNumber}${other.valid ? '' : ' (invalid)'}`, lap: other });
    return refs;
  }

  private changeReference(dir: -1 | 1): void {
    const lap = this.data?.laps[this.lapIndex];
    if (!lap) return;
    const count = this.references(lap).length;
    if (count < 1) return;
    this.referenceIndex = (this.referenceIndex + dir + count) % count;
    this.render();
  }

  private render(): void {
    const lap = this.data?.laps[this.lapIndex];
    this.body.replaceChildren();
    this.stops = [];
    this.lapRow.value.textContent = lap ? lapLabel(lap) : 'No complete flying lap';
    if (!lap) {
      this.summary.textContent = 'Complete a flying lap to record speed, throttle and brake.';
      this.referenceRow.value.textContent = 'No reference yet';
      this.body.append(h('p', 'mn-help', undefined, ['Standing starts and unfinished laps are excluded. Open Telemetry again after crossing the timing line.']));
      return;
    }
    const reference = this.references(lap)[this.referenceIndex];
    this.referenceRow.value.textContent = reference ? `${reference.name} · ${formatLapTime(reference.lap.timeS)}` : 'No second lap yet';
    if (!reference) {
      this.summary.textContent = 'Complete another flying lap to compare two recorded laps.';
      this.body.append(h('p', 'mn-help', undefined, ['Older saved best laps and ghosts have no pedal trace. A new best lap saves all three traces with its ghost.']));
      return;
    }
    const result = compareLaps(lap, reference.lap, this.data!.corners);
    const totalMs = Math.round(result.lapDeltaS * 1000);
    this.summary.textContent = `${lapLabel(lap)} · ${deltaText(totalMs)} s against ${reference.name.toLowerCase()}`;
    const charts = (['speedKmh', 'throttle', 'brake'] as const).map((key) => telemetryChart(lap, reference.lap, key, this.units()));
    const graphs = h('div', 'mn-telemetry__graphs', undefined, [
      h('p', 'mn-telemetry__legend', undefined, [h('span', 'mn-trace__lap', undefined, ['Inspected lap']), h('span', 'mn-trace__reference', undefined, [reference.name])]),
      ...charts,
    ]);
    const head = h('tr', undefined, undefined, ['Turn', 'Distance (m)', 'Delta (s)'].map((text) => h('th', undefined, { scope: 'col' }, [text])));
    const rows = result.corners.map((c) => h('tr', undefined, { tabindex: 0 }, [
      h('td', undefined, undefined, [`T${c.turn} ${c.name}`]),
      h('td', 'mn-num', undefined, [`${Math.round(c.fromM)}–${Math.round(c.toM)}`]),
      h('td', `mn-num ${deltaClass(c.deltaMs)}`, undefined, [deltaText(c.deltaMs)]),
    ]));
    const corners = h('div', 'mn-telemetry__corners', undefined, [
      h('p', 'mn-help', undefined, ['Each turn includes the straight up to the midpoint between neighbouring turns. Together they cover the whole lap.']),
      h('table', 'mn-table', undefined, [h('caption', 'mn-sr', undefined, ['Time gained or lost by corner']), h('thead', undefined, undefined, [head]),
        h('tbody', undefined, undefined, rows),
        h('tfoot', undefined, undefined, [h('tr', undefined, undefined, [h('td', undefined, { colspan: 2 }, ['Lap total']), h('td', `mn-num ${deltaClass(totalMs)}`, undefined, [deltaText(totalMs)])])]),
      ]),
    ]);
    this.body.append(graphs, corners);
    this.stops = [...charts, ...rows];
  }
}
