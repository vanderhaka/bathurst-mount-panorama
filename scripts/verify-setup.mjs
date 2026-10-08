#!/usr/bin/env node
// Native UI/keyboard acceptance; Gamepad API fixture exercises unchanged runtime polling.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';
import { answerSteerQuestion } from './steer-question.mjs';

export const DEFAULTS = Object.freeze({ brakeBiasFront: .6, frontArbNpm: 52000, rearArbNpm: 26000, frontPressureKpa: 150, rearPressureKpa: 150 });
const CARS = ['camaro', 'mustang', 'supra'], NAMES = ['Camaro ZL1', 'Mustang GT', 'GR Supra'];
const FIELDS = ['Brake bias', 'Front anti-roll bar', 'Rear anti-roll bar', 'Front tyre pressure', 'Rear tyre pressure'];
const STEPS = [.005, 2000, 2000, 5, 5], KEYS = Object.keys(DEFAULTS);

export function installPadFixture() {
  const original = navigator.getGamepads;
  const input = window.__setupPadFixture = { enabled: false, pressed: [] };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value() {
    const native = original ? Reflect.apply(original, navigator, []) : [];
    if (!input.enabled) return native;
    return [{ id: 'DualSense Wireless Controller Acceptance Fixture', index: 0, connected: true, mapping: 'standard',
      timestamp: performance.now(), axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({
        pressed: input.pressed.includes(i), touched: input.pressed.includes(i), value: input.pressed.includes(i) ? 1 : 0 })) }, ...native];
  } });
}

function readSetupView() {
  const screen = document.querySelector('.mn-screen--settings'), pane = screen.querySelector('.mn-tabpage__rows:not([hidden])');
  const groups = [...pane.querySelectorAll('[role="group"]')], done = screen.querySelector('.mn-btn--primary').getBoundingClientRect();
  return { tab: screen.querySelector('[role="tab"][aria-selected="true"]').textContent.trim(),
    car: groups[0]?.dataset.value, name: groups[0]?.querySelector('.mn-value__v').textContent.trim(),
    rows: groups.slice(1).map(row => ({ label: row.querySelector('.mn-value__label').textContent.trim(),
      value: Number(row.dataset.value), changed: row.dataset.changed, text: row.querySelector('.mn-value__text').textContent.trim() })),
    tabs: [...screen.querySelectorAll('[role="tab"]')].map(tab => tab.textContent.trim()),
    doneVisible: done.left >= 0 && done.top >= 0 && done.right <= innerWidth && done.bottom <= innerHeight };
}

export function checkSetupView(view, car, expected) {
  assert.equal(view.tab, 'Setup'); assert.equal(view.car, car); assert.equal(view.name, NAMES[CARS.indexOf(car)]);
  assert.deepEqual(view.rows.map(row => row.label), FIELDS); assert.ok(view.doneVisible, 'Done must remain reachable');
  for (const [i, key] of KEYS.entries()) {
    const row = view.rows[i], value = expected[key];
    assert.equal(row.value, value); assert.equal(row.changed, String(value !== DEFAULTS[key]));
    const text = i === 0 ? `${(value * 100).toFixed(1)}% front` : i < 3 ? `${value / 1000} kN/m`
      : `${value.toFixed(0)} kPa · ${(value / 6.894757).toFixed(1)} psi`;
    assert.equal(row.text, text);
  }
  return { car, setup: Object.fromEntries(view.rows.map((row, i) => [KEYS[i], row.value])), tabs: view.tabs };
}

function readSaved() {
  return Object.fromEntries(['camaro', 'mustang', 'supra'].map(car => [car, JSON.parse(localStorage.getItem(`bathurst.setup.v1.${car}`) ?? 'null')]));
}

function readRace() {
  const game = window.__game, race = game.race, v = race?.player.vehicle;
  return { state: game.state, car: race?.session.car, setup: v?.setup, specBias: v?.spec.brakeBiasFront,
    sameSession: race?.session === window.__setupSession, camera: game.rig.mode, line: game.settings.racingLine,
    racing: race?.session.racing, lapTime: race?.session.timer.lapTime, valid: race?.session.timer.valid,
    speedMps: v?.speed, throttle: v?.telemetry.throttle, padStyle: game.input.padStyle,
    message: document.querySelector('.hud-banner__text')?.textContent };
}

export function checkLive(race, car, expected) {
  assert.equal(race.state, 'race'); assert.equal(race.car, car); assert.deepEqual(race.setup, expected);
  assert.equal(race.specBias, DEFAULTS.brakeBiasFront, 'Setup must not mutate the car specification');
}

async function main() {
  const engine = process.argv[2] ?? 'chromium', url = process.argv[3] ?? 'http://127.0.0.1:5181/';
  assert.ok(['chromium', 'webkit'].includes(engine));
  const output = resolve(process.argv[4] ?? '/private/tmp/bathurst-item-3.4-acceptance');
  await mkdir(output, { recursive: true });
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, hasTouch: true, deviceScaleFactor: 1 });
  await context.addInitScript(installPadFixture);
  const page = await context.newPage();
  const report = { engine, browser: browser.version(), origin: new URL(url).origin, status: 'running', errors: [], views: [], races: [], controls: [],
    fixtures: ['Fresh isolated storage; native menu touch taps and keyboard events',
      'Standard Gamepad API fixture only; actual InputManager polling and race/menu actions, no setup/action/physics injection'],
    limitations: ['Virtual button polling does not prove physical gamepad hardware.', 'Desktop engines do not establish physical phone behavior.'] };
  const expected = Object.fromEntries(CARS.map(car => [car, { ...DEFAULTS }]));
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await authenticatePreview(page, url);
  const photo = name => page.screenshot({ path: resolve(output, `${engine}-${name}.png`), scale: 'css' });
  const saveReport = () => writeFile(resolve(output, `${engine}-setup.json`), JSON.stringify(report, null, 2) + '\n');
  const button = (screen, name) => page.locator(`.mn-screen--${screen}`).getByRole('button', { name, exact: true });
  const pane = () => page.locator('.mn-screen--settings .mn-tabpage__rows:not([hidden])');
  const settings = async from => {
    await button(from, 'Settings').tap(); await page.locator('.mn-screen--settings').waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Setup', exact: true }).tap();
  };
  const chooseSetupCar = async car => {
    for (let i = 0; i < 4; i++) {
      if ((await page.evaluate(readSetupView)).car === car) return;
      await pane().getByRole('button', { name: 'Next car', exact: true }).tap();
    }
    throw new Error(`Missing Setup car ${car}`);
  };
  const checkView = async name => {
    const view = await page.evaluate(readSetupView);
    report.views.push({ name, ...checkSetupView(view, view.car, expected[view.car]), view }); await photo(name);
  };
  const adjust = async (car, index, count) => {
    for (let step = 0; step < Math.abs(count); step++) {
      await pane().getByRole('button', { name: `${count > 0 ? 'Next' : 'Previous'} ${FIELDS[index].toLowerCase()}`, exact: true }).tap();
      const key = KEYS[index]; expected[car][key] = Number((expected[car][key] + Math.sign(count) * STEPS[index]).toFixed(6));
      checkSetupView(await page.evaluate(readSetupView), car, expected[car]);
      assert.deepEqual((await page.evaluate(readSaved))[car], expected[car]);
    }
  };
  const pause = async () => {
    await page.touchscreen.tap(420, 120); await page.locator('.tc-btn--pause').waitFor({ state: 'visible' });
    await page.locator('.tc-btn--pause').tap(); await page.locator('.mn-screen--pause').waitFor({ state: 'visible' });
    assert.equal((await page.evaluate(readRace)).state, 'paused');
  };
  const raceReady = async () => {
    await page.waitForFunction(() => window.__game.state === 'race' && window.__game.race);
    await page.touchscreen.tap(420, 120); await page.locator('.tc-pedal--throttle').waitFor({ state: 'visible' });
  };
  const checkRace = async (name, car, sameSession = true) => {
    const race = await page.evaluate(readRace); checkLive(race, car, expected[car]); assert.equal(race.sameSession, sameSession);
    report.races.push({ name, ...race }); await photo(name); return race;
  };
  const pad = async buttons => {
    await page.evaluate(pressed => { window.__setupPadFixture.enabled = true; window.__setupPadFixture.pressed = pressed; }, buttons);
    await page.waitForTimeout(180);
  };
  const bias = async (name, dir, press, release, repeat) => {
    const car = 'camaro', target = Number((expected[car].brakeBiasFront + dir * .005).toFixed(6));
    await press();
    try {
      await page.waitForFunction(value => window.__game.race.player.vehicle.setup.brakeBiasFront === value, target);
      expected[car].brakeBiasFront = target; await repeat?.(); await page.waitForTimeout(350);
      const race = await page.evaluate(readRace); checkLive(race, car, expected[car]);
      assert.equal(race.message, `BRAKE BIAS ${(target * 100).toFixed(1)}% FRONT`);
      const saved = await page.evaluate(readSaved); assert.deepEqual(saved[car], expected[car]);
      report.controls.push({ name, ...race, savedSetup: saved[car] });
      await photo(name);
    } finally { await release(); }
  };
  const newRace = async car => {
    await button('title', 'Time trial').tap();
    for (let i = 0; i < 4; i++) {
      if ((await page.locator('.mn-screen--car .mn-car__name').textContent()).trim() === NAMES[CARS.indexOf(car)]) break;
      await button('car', 'Next car').tap();
    }
    assert.equal((await page.locator('.mn-screen--car .mn-car__name').textContent()).trim(), NAMES[CARS.indexOf(car)]);
    await button('car', 'Start time trial').tap(); await answerSteerQuestion(page); await raceReady();
  };
  try {
    await page.goto(url); await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    assert.deepEqual(await page.evaluate(readSaved), { camaro: null, mustang: null, supra: null });
    await settings('title');
    for (const car of CARS) { await chooseSetupCar(car); await checkView(`default-${car}`); }
    const edits = [[2, 1, -1, 1, -1], [-1, -1, 1, -1, 1], [3, 2, 2, 2, -2]];
    for (const [c, car] of CARS.entries()) {
      await chooseSetupCar(car);
      for (const [i, count] of edits[c].entries()) await adjust(car, i, count);
      await checkView(`saved-${car}`);
    }
    await pane().getByRole('button', { name: 'Reset GR Supra setup to defaults', exact: true }).tap();
    expected.supra = { ...DEFAULTS }; await checkView('reset-supra');
    assert.deepEqual(await page.evaluate(readSaved), expected);
    report.savedBeforeReload = await page.evaluate(readSaved); report.status = 'saved-before-reload'; await saveReport();
    await page.reload(); await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    assert.deepEqual(await page.evaluate(readSaved), expected); await settings('title');
    for (const car of CARS) { await chooseSetupCar(car); await checkView(`reloaded-${car}`); }
    await button('settings', 'Done').tap(); await newRace('camaro');
    await page.evaluate(() => { window.__setupSession = window.__game.race.session; }); await checkRace('first-session', 'camaro');
    await page.waitForFunction(() => window.__game.race.session.racing, null, { timeout: 20000 });
    await bias('keyboard-front', 1, () => page.keyboard.down(']'), () => page.keyboard.up(']'), () => page.keyboard.down(']'));
    await bias('keyboard-rear', -1, () => page.keyboard.down('['), () => page.keyboard.up('['), () => page.keyboard.down('['));
    await bias('left-stick-click', -1, () => pad([10]), () => pad([]));
    await bias('right-stick-click', 1, () => pad([11]), () => pad([]));
    await pad([10, 11]); await pad([]); checkLive(await page.evaluate(readRace), 'camaro', expected.camaro);
    assert.deepEqual(await page.evaluate(readSaved), expected); report.simultaneousStickClicksCancel = true;
    await bias('keyboard-persisted', 1, () => page.keyboard.down(']'), () => page.keyboard.up(']'));
    const beforeLegacy = await page.evaluate(readRace);
    await pad([5]); await pad([]); const afterCamera = await page.evaluate(readRace);
    const cameras = ['chase', 'chaseFar', 'bonnet', 'cockpit', 'tv'];
    assert.equal(afterCamera.camera, cameras[(cameras.indexOf(beforeLegacy.camera) + 1) % cameras.length]);
    await pad([3]); await pad([]); const afterLine = await page.evaluate(readRace), lines = ['off', 'braking', 'full'];
    assert.equal(afterLine.line, lines[(lines.indexOf(beforeLegacy.line) + 1) % lines.length]);
    checkLive(afterLine, 'camaro', expected.camaro); assert.equal(afterLine.padStyle, 'ps5');
    report.legacyButtons = { beforeLegacy, afterCamera, afterLine };
    await pause(); await button('pause', 'Controls').tap();
    const controlsText = await page.locator('.mn-screen--controls').textContent();
    for (const text of ['Brake bias rearward', 'Brake bias forward', 'L3', 'R3', 'R1']) assert.ok(controlsText.includes(text));
    report.controlsHelp = controlsText; await photo('controls-help'); await button('controls', 'Back').tap();
    await settings('pause'); assert.equal((await page.evaluate(readSetupView)).car, 'camaro');
    await page.keyboard.press(']'); await pad([10]); await pad([]); await pad([11]); await pad([]);
    assert.deepEqual(await page.evaluate(readSaved), expected); report.menuBiasSuppressed = true;
    const view = await page.evaluate(readSetupView); await pad([5]); await pad([]);
    const selected = await page.locator('.mn-screen--settings [role="tab"][aria-selected="true"]').textContent();
    assert.equal(selected.trim(), view.tabs[(view.tabs.indexOf('Setup') + 1) % view.tabs.length]);
    report.legacyMenuTab = selected.trim(); await photo('r1-menu-tab');
    await page.getByRole('tab', { name: 'Setup', exact: true }).tap();
    await adjust('camaro', 1, 1); await adjust('camaro', 3, 1); await checkView('paused-adjustment');
    await button('settings', 'Done').tap(); await button('pause', 'Resume').tap(); await raceReady();
    await checkRace('resumed-setup', 'camaro');
    await page.keyboard.down('ArrowUp');
    try { await page.waitForFunction(() => window.__game.race.player.vehicle.telemetry.throttle > .1); await page.waitForTimeout(400); }
    finally { await page.keyboard.up('ArrowUp'); }
    const driving = await page.evaluate(readRace); assert.ok(driving.racing && driving.lapTime > 0 && Math.abs(driving.speedMps) > .5);
    report.driving = driving; await pause();
    await page.locator('.mn-screen--pause').getByRole('button', { name: /^Reset to track:/ }).tap(); await raceReady();
    const recovered = await checkRace('recovered-setup', 'camaro'); assert.equal(recovered.valid, false);
    await pause(); await button('pause', 'Restart').tap(); await raceReady(); await checkRace('restarted-setup', 'camaro');
    for (const car of ['mustang', 'supra']) {
      await pause(); await button('pause', 'Quit to menu').tap(); await page.locator('.mn-screen--title').waitFor({ state: 'visible' });
      await newRace(car); await checkRace(`new-session-${car}`, car, false);
    }
    assert.deepEqual(await page.evaluate(readSaved), expected); report.savedAfterRace = await page.evaluate(readSaved);
    report.status = 'race-complete-before-reload'; await saveReport();
    await page.reload(); await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    assert.deepEqual(await page.evaluate(readSaved), expected); await settings('title');
    for (const car of CARS) { await chooseSetupCar(car); await checkView(`persisted-after-race-${car}`); }
    assert.deepEqual(report.errors, []); report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error); report.savedAtFailure = await page.evaluate(readSaved).catch(() => null);
    report.raceAtFailure = await page.evaluate(readRace).catch(() => null); await photo('failure').catch(() => {}); throw error;
  } finally { await saveReport(); await browser.close(); }
  console.log(JSON.stringify({ engine, status: report.status, views: report.views.length, races: report.races.length, controls: report.controls.length }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
