#!/usr/bin/env node
// Actual standing start and two flying laps; no pose, timer or trace insertion.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';
import { answerSteerQuestion } from './steer-question.mjs';

const OTHER_CIRCUITS = { adelaide: { lengthM: 3219, toBathurst: 'Previous circuit' }, 'gold-coast': { lengthM: 2960, toBathurst: 'Next circuit' } };

export function observeSession() {
  const session = window.__game.race.session, vehicle = session.entity.vehicle, original = session.update;
  window.__telemetrySession = session;
  const probe = window.__telemetryProbe = { live: [], completions: [] };
  session.update = function(...args) {
    const result = Reflect.apply(original, this, args);
    if (this.racing && probe.live.length < 100000) probe.live.push({ lapNumber: this.timer.lapNumber,
      distanceM: this.lapDist(), timeS: this.timer.lapTime, speedKmh: Math.abs(vehicle.telemetry.speed) * 3.6,
      throttle: vehicle.telemetry.throttle, brake: vehicle.telemetry.brake });
    if (result) probe.completions.push({ ...result, recordedLaps: this.telemetrySnapshot().laps.length });
    return result;
  };
}

export function checkCapture(data, probe) {
  assert.equal(probe.completions.length, 3, 'One standing lap and two flying laps must actually finish');
  assert.deepEqual(probe.completions.map(lap => lap.standing), [true, false, false]);
  assert.deepEqual(probe.completions.map(lap => lap.recordedLaps), [0, 1, 2]);
  assert.deepEqual(data.laps.map(lap => lap.lapNumber), [2, 3]);
  assert.ok(data.best, 'Actual valid flying lap must populate Best (the lap the ghost replays)');
  const key = s => `${s.lapNumber}|${s.distanceM}|${s.timeS}`;
  const live = new Map(probe.live.map(sample => [key(sample), sample]));
  let matchedSamples = 0;
  for (const lap of data.laps) {
    assert.ok(lap.valid && lap.samples.length > 500, 'Full valid flying trace required');
    assert.equal(lap.samples[0].distanceM, 0); assert.equal(lap.samples[0].timeS, 0);
    assert.equal(lap.samples.at(-1).distanceM, lap.lengthM); assert.equal(lap.samples.at(-1).timeS, lap.timeS);
    for (const [i, sample] of lap.samples.entries()) {
      assert.ok(Object.values(sample).every(Number.isFinite));
      assert.ok(sample.throttle >= 0 && sample.throttle <= 1 && sample.brake >= 0 && sample.brake <= 1);
      if (i) assert.ok(sample.distanceM > lap.samples[i - 1].distanceM && sample.timeS > lap.samples[i - 1].timeS);
      if (i && i < lap.samples.length - 1) {
        const actual = live.get(key({ ...sample, lapNumber: lap.lapNumber }));
        assert.ok(actual, 'Interior trace sample must match an observed physics/session update');
        for (const field of ['speedKmh', 'throttle', 'brake']) assert.equal(sample[field], actual[field]);
        matchedSamples++;
      }
    }
    for (const field of ['speedKmh', 'throttle', 'brake']) {
      const values = lap.samples.map(sample => sample[field]);
      assert.ok(Math.max(...values) - Math.min(...values) > (field === 'speedKmh' ? 30 : .1), `${field} must be real changing driving data`);
    }
  }
  return { completedLaps: 3, flyingTraces: 2, actualUpdateCount: probe.live.length, matchedSamples, completions: probe.completions };
}

export function expectedPath(lap, key, max, units) {
  return lap.samples.map((sample, i) => {
    const value = key === 'speedKmh' && units === 'mph' ? sample[key] / 1.609344 : sample[key];
    return `${i ? 'L' : 'M'}${(40 + sample.distanceM / lap.lengthM * 740).toFixed(2)},${(84 - value / max * 70).toFixed(2)}`;
  }).join(' ');
}

function readScreen() {
  const root = document.querySelector('.mn-screen--telemetry'), body = root.querySelector('.mn-telemetry__body');
  const value = label => root.querySelector(`[role="group"][aria-label="${label}"] .mn-value__v`).textContent.trim();
  const box = body.getBoundingClientRect(), back = root.querySelector('.mn-btn').getBoundingClientRect();
  return { screen: document.querySelector('.bx-menus').dataset.screen, state: window.__game.state,
    lap: value('Lap to inspect'), reference: value('Compare with'), units: window.__game.settings.units,
    graphs: [...root.querySelectorAll('.mn-trace')].map(figure => ({ label: figure.querySelector('figcaption').textContent,
      lap: figure.querySelector('path.mn-trace__lap').getAttribute('d'), reference: figure.querySelector('path.mn-trace__reference').getAttribute('d') })),
    rows: [...root.querySelectorAll('tbody tr')].map(row => [...row.children].map(cell => cell.textContent.trim())),
    total: root.querySelector('tfoot td:last-child')?.textContent.trim(),
    scroll: { top: body.scrollTop, height: body.clientHeight, full: body.scrollHeight, width: body.clientWidth, fullWidth: body.scrollWidth,
      box: { x: box.x, y: box.y, width: box.width, height: box.height } },
    backVisible: back.left >= 0 && back.top >= 0 && back.right <= innerWidth && back.bottom <= innerHeight };
}

export function checkScreen(view, data) {
  assert.equal(view.screen, 'telemetry'); assert.equal(view.state, 'paused');
  const lap = data.laps.find(l => l.lapNumber === Number(/^Lap (\d+)/.exec(view.lap)?.[1]));
  const reference = view.reference.startsWith('Best lap') ? data.best
    : data.laps.find(l => l.lapNumber === Number(/^Lap (\d+)/.exec(view.reference)?.[1]));
  assert.ok(lap && reference && lap.lapNumber !== reference.lapNumber, 'Selectors must compare two distinct real laps');
  assert.equal(view.graphs.length, 3);
  for (const [i, key] of ['speedKmh', 'throttle', 'brake'].entries()) {
    const top = Math.max(...lap.samples.map(s => s.speedKmh), ...reference.samples.map(s => s.speedKmh));
    const max = key === 'speedKmh' ? Math.ceil((view.units === 'mph' ? top / 1.609344 : top) / 20) * 20 : 1;
    assert.equal(view.graphs[i].lap, expectedPath(lap, key, max, view.units));
    assert.equal(view.graphs[i].reference, expectedPath(reference, key, max, view.units));
    assert.equal(view.graphs[i].label, ['Speed (' + (view.units === 'mph' ? 'MPH' : 'KM/H') + ')', 'Throttle (%)', 'Brake (%)'][i]);
  }
  const at = (trace, distance) => {
    if (distance <= 0) return 0;
    if (distance >= trace.lengthM) return trace.timeS;
    const i = trace.samples.findIndex(sample => sample.distanceM >= distance), a = trace.samples[i - 1], b = trace.samples[i];
    return a.timeS + (b.timeS - a.timeS) * (distance - a.distanceM) / (b.distanceM - a.distanceM);
  };
  const corners = [...data.corners].sort((a, b) => a.distanceM - b.distanceM);
  const bounds = [0, ...corners.slice(1).map((c, i) => (corners[i].distanceM + c.distanceM) / 2), lap.lengthM];
  const boundary = bounds.map(distance => Math.round((at(lap, distance) - at(reference, distance)) * 1000));
  const milliseconds = text => Math.round(Number(text) * 1000);
  assert.equal(view.rows.length, data.corners.length);
  for (const [i, row] of view.rows.entries()) {
    assert.equal(row[0], `T${corners[i].turn} ${corners[i].name}`);
    assert.equal(row[1], `${Math.round(bounds[i])}–${Math.round(bounds[i + 1])}`);
    assert.equal(milliseconds(row[2]), boundary[i + 1] - boundary[i]);
  }
  assert.equal(milliseconds(view.total), Math.round((lap.timeS - reference.timeS) * 1000));
  assert.equal(view.rows.reduce((sum, row) => sum + milliseconds(row[2]), 0), milliseconds(view.total));
  assert.ok(view.backVisible, 'Back must stay reachable inside the viewport');
  return { lapNumber: lap.lapNumber, reference: view.reference, cornerCount: data.corners.length, totalMs: milliseconds(view.total), graphsMatched: 6 };
}

async function main() {
  const engine = process.argv[2] ?? 'chromium', url = process.argv[3] ?? 'http://127.0.0.1:5181/';
  assert.ok(['chromium', 'webkit'].includes(engine));
  const output = resolve(process.argv[4] ?? '/private/tmp/bathurst-item-3.3-acceptance');
  await mkdir(output, { recursive: true });
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await context.newPage(), cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  const report = { engine, browser: browser.version(), origin: new URL(url).origin, status: 'running', errors: [], views: [], resumes: [],
    fixtures: ['Fresh isolated storage; actual standing lap and two flying laps with preview setDebugAutopilot/timeScale=3',
      'Original session update observed intact; no car pose, vehicle telemetry, timer, records or trace insertion',
      'Native menu taps, keyboard driving, and Chrome touch scrolling or WebKit wheel scrolling'],
    limitations: ['Desktop engine rendering and native input do not establish physical phone behavior.'] };
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await authenticatePreview(page, url);
  const photo = name => page.screenshot({ path: resolve(output, `${engine}-${name}.png`), scale: 'css' });
  const button = (screen, name) => page.locator(`.mn-screen--${screen}`).getByRole('button', { name, exact: true });
  const pause = async () => {
    if (!await page.locator('.tc-btn--pause').isVisible()) await page.touchscreen.tap(420, 120);
    await page.locator('.tc-btn--pause').waitFor({ state: 'visible' });
    await page.locator('.tc-btn--pause').tap();
    await page.waitForFunction(() => window.__game.state === 'paused' && document.querySelector('.bx-menus').dataset.screen === 'pause');
  };
  const choose = async (label, predicate) => {
    const row = page.locator(`.mn-screen--telemetry [role="group"][aria-label="${label}"] .mn-value__v`);
    for (let i = 0; i < 15; i++) {
      const text = (await row.textContent()).trim();
      if (predicate(text)) return text;
      await page.locator(`.mn-screen--telemetry [aria-label="Next ${label.toLowerCase()}"]`).tap();
    }
    throw new Error(`Missing selector choice: ${label}`);
  };
  const checkView = async name => {
    await page.locator('.mn-screen--telemetry').waitFor({ state: 'visible' }); await page.waitForTimeout(350);
    const view = await page.evaluate(readScreen);
    report.views.push({ name, ...checkScreen(view, report.telemetry), view });
    await photo(name);
  };
  const resume = async route => {
    await button('pause', 'Resume').tap();
    await page.waitForFunction(() => window.__game.state === 'race');
    await page.locator('.tc-pedal--throttle').waitFor({ state: 'visible' });
    const before = await page.evaluate(() => window.__game.race.session.timer.lapTime);
    await page.keyboard.down('ArrowUp');
    try { await page.waitForFunction(() => window.__game.race.player.vehicle.telemetry.throttle > .1); await page.waitForTimeout(300); }
    finally { await page.keyboard.up('ArrowUp'); }
    const after = await page.evaluate(() => ({ timer: window.__game.race.session.timer.lapTime,
      sameSession: window.__game.race.session === window.__telemetrySession, speedMps: window.__game.race.player.vehicle.speed }));
    assert.ok(after.sameSession && after.timer > before && Math.abs(after.speedMps) > 1);
    report.resumes.push({ route, before, ...after });
    await page.touchscreen.tap(420, 120);
    await page.locator('.tc-btn--pause').waitFor({ state: 'visible' });
    await photo(`resumed-${route}`);
  };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    report.circuit = await page.evaluate(() => ({ id: window.__game.world.track.id, lengthM: window.__game.world.track.length }));
    await button('title', 'Time trial').tap(); await button('car', 'Start time trial').tap();
    await answerSteerQuestion(page);
    await page.waitForFunction(() => window.__game.state === 'race' && window.__game.race);
    await page.evaluate(() => { window.__game.setDebugAutopilot(true); window.__game.timeScale = 3; });
    await page.evaluate(observeSession);
    for (let laps = 1; laps <= 3; laps++) {
      await page.waitForFunction(count => window.__game.race.session.laps.length >= count, laps, { timeout: 240000, polling: 100 });
      console.log(`Actual completed laps: ${laps}/3`);
    }
    const captured = await page.evaluate(() => { const game = window.__game; game.timeScale = 1; game.setDebugAutopilot(false);
      return { data: game.race.session.telemetrySnapshot(), probe: window.__telemetryProbe }; });
    report.telemetry = captured.data;
    report.captureSource = { observedUpdates: captured.probe.live.length, completions: captured.probe.completions };
    report.capture = checkCapture(captured.data, captured.probe);
    assert.ok(captured.data.laps.every(lap => lap.lengthM === report.circuit.lengthM));
    await pause(); await button('pause', 'Telemetry').tap();
    const nonBest = text => Number(/^Lap (\d+)/.exec(text)?.[1]) !== report.telemetry.best.lapNumber;
    await choose('Lap to inspect', nonBest);
    await choose('Compare with', text => text.startsWith('Best lap')); await checkView('pause-best-lap');
    const previous = await page.locator('.mn-screen--telemetry [aria-label="Lap to inspect"] .mn-value__v').textContent();
    await page.locator('.mn-screen--telemetry [aria-label="Next lap to inspect"]').tap();
    assert.notEqual(await page.locator('.mn-screen--telemetry [aria-label="Lap to inspect"] .mn-value__v').textContent(), previous);
    await checkView('changed-lap');
    await page.setViewportSize({ width: 667, height: 375 });
    await checkView('narrow-top');
    const initial = await page.evaluate(readScreen); report.scroll = { before: initial.scroll, nativeSteps: [] };
    assert.ok(initial.scroll.full > initial.scroll.height && initial.scroll.height > 20);
    assert.ok(initial.scroll.fullWidth <= initial.scroll.width + 1, 'Narrow view must not require horizontal scrolling');
    for (let i = 0; i < 6; i++) {
      const view = await page.evaluate(readScreen), box = view.scroll.box;
      if (view.scroll.top + view.scroll.height >= view.scroll.full - 2) break;
      if (cdp) await cdp.send('Input.synthesizeScrollGesture', { x: box.x + box.width / 2, y: box.y + box.height / 2,
        yDistance: -900, speed: 1200, gestureSourceType: 'touch' });
      else { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.wheel(0, 900); }
      await page.waitForTimeout(200); report.scroll.nativeSteps.push((await page.evaluate(readScreen)).scroll.top);
    }
    report.scroll.after = (await page.evaluate(readScreen)).scroll;
    assert.ok(report.scroll.after.top > initial.scroll.top && report.scroll.after.top + report.scroll.after.height >= report.scroll.after.full - 2);
    await checkView('narrow-bottom');
    await button('telemetry', 'Back').tap(); await page.locator('.mn-screen--pause').waitFor({ state: 'visible' });
    await resume('pause-telemetry'); await pause(); await button('pause', 'Results').tap();
    await button('results', 'Back to session').waitFor({ state: 'visible' });
    assert.ok(await button('results', 'Main menu').isVisible());
    assert.equal(await page.locator('.mn-screen--results tbody tr').count(), 3); await photo('results');
    await button('results', 'Telemetry').tap(); await checkView('results-telemetry');
    await button('telemetry', 'Back').tap(); await page.locator('.mn-screen--results').waitFor({ state: 'visible' });
    await button('results', 'Back to session').tap(); await page.locator('.mn-screen--pause').waitFor({ state: 'visible' });
    await resume('results-telemetry'); await pause(); await button('pause', 'Results').tap();
    await page.keyboard.press('Escape'); await page.locator('.mn-screen--pause').waitFor({ state: 'visible' });
    assert.ok(await page.evaluate(() => window.__game.race.session === window.__telemetrySession));
    report.escapeReturnsToSession = true;
    if (report.circuit.id !== 'bathurst') {
      const other = OTHER_CIRCUITS[report.circuit.id];
      assert.ok(other, `Unknown circuit ${report.circuit.id}`);
      await page.reload(); await page.waitForFunction(() => window.__shotReady && window.__game.state === 'title', null, { timeout: 90000 });
      await button('title', 'Time trial').tap(); await button('car', 'Start time trial').tap(); await answerSteerQuestion(page);
      await page.waitForFunction(() => window.__game.state === 'race');
      report.restored = await page.evaluate(() => { const session = window.__game.race.session;
        return { bestS: session.records?.bestS, ghostDuration: session.ghost?.duration,
          lengthM: session.telemetrySnapshot().best?.lengthM, circuit: session.track.id }; });
      assert.equal(report.restored.bestS, report.telemetry.best.timeS);
      assert.equal(report.restored.lengthM, other.lengthM); assert.ok(Math.abs(report.restored.ghostDuration - report.restored.bestS) < 0.5);
      await pause(); await button('pause', 'Quit to menu').tap();
      await page.waitForFunction(() => window.__game.state === 'title');
      await Promise.all([page.waitForURL(next => !next.searchParams.has('track')),
        page.locator(`.mn-screen--title [aria-label="${other.toBathurst}"]`).tap()]);
      await page.waitForFunction(() => window.__shotReady && window.__game.world.track.id === 'bathurst', null, { timeout: 90000 });
      await button('title', 'Time trial').tap(); await button('car', 'Start time trial').tap(); await answerSteerQuestion(page);
      await page.waitForFunction(() => window.__game.state === 'race');
      report.separateBathurst = await page.evaluate(id => ({ records: window.__game.race.session.records,
        circuit: window.__game.race.session.track.id, circuitSaved: !!localStorage.getItem(`${id}.records.v2.camaro`) }), report.circuit.id);
      assert.equal(report.separateBathurst.circuit, 'bathurst'); assert.equal(report.separateBathurst.records, null);
      assert.equal(report.separateBathurst.circuitSaved, true);
    }
    assert.deepEqual(report.errors, []); report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error);
    report.atFailure = await page.evaluate(() => { const game = window.__game, session = game?.race?.session;
      return { state: game?.state, lapNumber: session?.timer.lapNumber, speedMps: game?.race?.player.vehicle.speed,
        completions: window.__telemetryProbe?.completions, telemetry: session?.telemetrySnapshot() }; }).catch(() => null);
    await photo('failure').catch(() => {}); throw error;
  } finally {
    await writeFile(resolve(output, `${engine}-telemetry.json`), JSON.stringify(report, null, 2) + '\n'); await browser.close();
  }
  console.log(JSON.stringify({ engine, status: report.status, capture: report.capture, resumes: report.resumes }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
