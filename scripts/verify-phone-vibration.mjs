#!/usr/bin/env node
// Wrap the browser's original API only. Actual game contacts generate every pulse.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';

export function installProbe() {
  const original = navigator.vibrate;
  const p = window.__phoneProbe = { apiPresent: typeof original === 'function',
    originalNative: typeof original === 'function' && Function.prototype.toString.call(original).includes('[native code]'),
    phase: 'boot', calls: [], frames: [], impacts: [], lastImpact: null };
  const snapshot = () => {
    const v = window.__game?.race?.player?.vehicle;
    return { t: performance.now(), phase: p.phase, speed: v?.speed ?? null, s: v?.tp.s ?? null, d: v?.tp.d ?? null,
      wheels: v?.wheels.map(w => ({ surface: w.surface, load: w.load })) ?? [] };
  };
  if (p.apiPresent) Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true,
    value: function(...args) {
      const entry = { ...snapshot(), pattern: Array.isArray(args[0]) ? [...args[0]] : args[0],
        receiverIsNavigator: this === navigator, activated: navigator.userActivation?.hasBeenActive ?? false,
        lastImpact: p.lastImpact };
      p.calls.push(entry);
      try { entry.accepted = Reflect.apply(original, this, args); return entry.accepted; }
      catch (error) { entry.error = String(error); throw error; }
    } });
  const frame = () => {
    if (p.phase !== 'boot' && window.__game?.state === 'race' && p.frames.length < 3000) p.frames.push(snapshot());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

export function observeImpacts() {
  const entity = window.__game.race.player, original = entity.simulate, p = window.__phoneProbe;
  entity.simulate = function(...args) {
    const result = Reflect.apply(original, this, args);
    for (const impact of result) {
      const entry = { t: performance.now(), phase: p.phase, speed: impact.speed, x: impact.x, y: impact.y, z: impact.z };
      p.lastImpact = entry;
      if (p.impacts.length < 2000) p.impacts.push(entry);
    }
    return result;
  };
}

export function checkPulses(calls) {
  const positive = calls.filter(c => c.pattern > 0);
  for (const c of calls) {
    assert.equal(typeof c.pattern, 'number', 'Game feedback must be a single short pulse');
    assert.ok(c.pattern === 0 || c.pattern === 18 || c.pattern >= 25 && c.pattern <= 60);
    assert.ok(c.receiverIsNavigator && c.activated, 'Original native receiver and sticky activation required');
    assert.equal(c.error, undefined, 'The original vibration API threw');
    assert.equal(typeof c.accepted, 'boolean');
  }
  const gaps = positive.slice(1).map((c, i) => c.t - positive[i].t);
  assert.ok(gaps.every(ms => ms >= 199), '200ms real-time cooldown (1ms timestamp tolerance)');
  return { nativeCallCount: calls.length, positiveCount: positive.length,
    cancelCount: calls.length - positive.length, minGapMs: gaps.length ? Math.min(...gaps) : null,
    acceptedCount: positive.filter(c => c.accepted).length, rejectedCount: positive.filter(c => !c.accepted).length };
}

function placeFixture({ kind, phase }) {
  const game = window.__game, entity = game.race.player, v = entity.vehicle, t = v.track;
  const chase = t.corners.find(c => c.turn === 21);
  if (!chase) throw new Error('Chase T21 is absent from the actual track');
  const s = kind === 'kerb' ? chase.s : t.wrapS(t.gridLineS + 50);
  const i = Math.floor(t.wrapS(s) / t.spacing);
  if (kind === 'kerb' && v.kerbs.left[i] <= .8) throw new Error('Actual Chase left kerb is too narrow for this approach');
  const d = kind === 'kerb' ? t.left.edge[i] - 1.3
    : t.left.wall[i] - (v.spec.dimensions.length / 2 + v.spec.dimensions.width / 2 + .8);
  entity.reset(s, d);
  v.heading += kind === 'kerb' ? .15 : .55;
  window.__phoneProbe.phase = phase;
  return { kind, phase, s: v.tp.s, d: v.tp.d, heading: v.heading,
    forwardSpeedFixtureMps: kind === 'kerb' ? 26 : 12, chaseS: chase.s,
    edgeM: t.left.edge[i], kerbWidthM: v.kerbs.left[i], wallM: t.left.wall[i],
    method: 'Actual player reset at rest; pose fixture only. Native throttle then seeds aligned forward velocity.' };
}

async function main() {
  const mode = process.argv[2] ?? 'android', url = process.argv[3] ?? 'http://127.0.0.1:5181/';
  assert.ok(['android', 'iphone'].includes(mode));
  const output = resolve(process.argv[4] ?? `/private/tmp/bathurst-item-2.9-${mode}-acceptance`);
  await mkdir(output, { recursive: true });
  const browser = mode === 'iphone' ? await webkit.launch() : await chromium.launch({ channel: 'chrome',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true,
    isMobile: true, deviceScaleFactor: 3, userAgent: mode === 'android'
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await context.addInitScript(installProbe);
  const page = await context.newPage(), errors = [], report = { mode, browser: browser.version(),
    targetOrigin: new URL(url).origin, status: 'running', phases: [], errors,
    fixtures: ['844×390 CSS px, DPR 3, fresh isolated storage, Android/iPhone UA and touch emulation',
      'Settings chosen by native taps; actual car pose/forward velocity fixtures shorten approach',
      'Original navigator.vibrate receiver/arguments/return/errors preserved; absent API stays absent',
      'simulate is observed by calling its original method and returning its unchanged impact array'],
    limitations: ['Desktop Android emulation observes native API calls/return values, not physical phone vibration.',
      'False API returns are recorded as rejected; neither true nor false establishes physical buzzing.',
      'WebKit/iPhone uses native keyboard driving then restores touch; physical iPhone remains a device check.'] };
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await authenticatePreview(page, url);
  const cdp = mode === 'android' ? await context.newCDPSession(page) : null;
  const restoreTouch = async () => {
    if (!await page.locator('.tc-btn--pause').isVisible()) {
      await page.touchscreen.tap(420, 120);
      await page.locator('.tc-btn--pause').waitFor({ state: 'visible' });
    }
  };
  const pause = async () => {
    await restoreTouch(); await page.locator('.tc-btn--pause').tap();
    await page.waitForFunction(() => window.__game.state === 'paused');
  };
  const choose = async (key, label, value) => {
    for (let i = 0; await page.evaluate(k => window.__game.settings[k], key) !== value; i++) {
      assert.ok(i < 8, `Setting not available: ${key}`);
      await page.locator(`[aria-label="Next ${label.toLowerCase()}"]`).tap();
    }
    const row = page.locator('.mn-value').filter({ has: page.locator('.mn-value__label', { hasText: new RegExp(`^${label}$`) }) });
    assert.equal(await row.getAttribute('data-value'), String(value));
  };
  const configure = async (enabled, label) => {
    await pause(); await page.locator('.mn-screen--pause .mn-btn:has-text("Settings")').tap();
    await page.locator('[role="tab"]:has-text("Driving assists")').tap();
    await choose('damage', 'Damage', 'off'); // Identical collision contacts without carrying damage between fixtures.
    await page.locator('[role="tab"]:has-text("Steering")').tap();
    for (const field of [['phoneVibration', 'Phone vibration', enabled], ['touchMode', 'Touch steering mode', 'buttons'],
      ['touchAnalogThrottle', 'Analog throttle', false], ['touchAutoThrottle', 'Auto-throttle', false]]) await choose(...field);
    await page.screenshot({ path: resolve(output, `${mode}-settings-${label}.png`), scale: 'css' });
    await page.locator('.mn-screen--settings .mn-btn:has-text("Done")').tap();
  };
  const heldThrottle = async on => {
    if (on) {
      await page.waitForFunction(() => !window.__game.input.menusOpen);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    if (!cdp) return on ? page.keyboard.down('ArrowUp') : page.keyboard.up('ArrowUp');
    if (on) await page.locator('.tc-pedal--throttle').waitFor({ state: 'visible' });
    const b = on ? await page.locator('.tc-pedal--throttle').boundingBox() : null;
    if (on) assert.ok(b, 'Actual throttle must be visible');
    await cdp.send('Input.dispatchTouchEvent', { type: on ? 'touchStart' : 'touchEnd',
      touchPoints: on ? [{ x: b.x + b.width / 2, y: b.y + b.height * .1, id: 0 }] : [] });
  };
  const runContact = async (kind, enabled, suffix = '') => {
    const phase = `${kind}-${enabled ? 'on' : 'off'}${suffix}`;
    await configure(enabled, phase);
    const fixture = await page.evaluate(placeFixture, { kind, phase });
    await page.locator('.mn-screen--pause .mn-btn:has-text("Resume")').tap();
    await page.waitForFunction(() => window.__game.state === 'race');
    await heldThrottle(true);
    try {
      await page.waitForFunction(() => window.__game.race.player.vehicle.telemetry.throttle > .1);
      await page.evaluate(speed => {
        const v = window.__game.race.player.vehicle;
        v.vx = speed * Math.sin(v.heading); v.vz = speed * Math.cos(v.heading);
      }, fixture.forwardSpeedFixtureMps);
      await page.waitForFunction(({ kind, phase }) => {
        const p = window.__phoneProbe;
        return kind === 'kerb' ? p.frames.some(f => f.phase === phase && Math.abs(f.speed) > 8
          && f.wheels.some(w => w.surface === 'kerb' && w.load > 0))
          : p.impacts.some(i => i.phase === phase && i.speed > 2);
      }, { kind, phase }, { timeout: 5000 });
      await page.screenshot({ path: resolve(output, `${mode}-${phase}-contact.png`), scale: 'css' });
      await page.waitForTimeout(500);
    } finally {
      await heldThrottle(false);
      if (!cdp) await page.touchscreen.tap(420, 120);
      await restoreTouch();
    }
    const evidence = await page.evaluate(phase => {
      const p = window.__phoneProbe;
      return { phase, frames: p.frames.filter(f => f.phase === phase), calls: p.calls.filter(c => c.phase === phase),
        impacts: p.impacts.filter(i => i.phase === phase), enabled: window.__game.settings.phoneVibration };
    }, phase);
    evidence.fixture = fixture; report.phases.push(evidence);
    assert.equal(evidence.enabled, enabled);
    const positive = evidence.calls.filter(c => c.pattern > 0);
    if (kind === 'kerb') {
      assert.ok(evidence.frames.some(f => f.wheels.every(w => w.surface === 'road')), 'Actual road approach must precede the kerb');
      assert.ok(evidence.frames.some(f => Math.abs(f.speed) > 8 && f.wheels.some(w => w.surface === 'kerb' && w.load > 0)));
      if (mode === 'android' && enabled) assert.ok(positive.some(c => c.accepted && c.pattern === 18 && Math.abs(c.speed) > 8
        && c.wheels.some(w => w.surface === 'kerb' && w.load > 0)), 'Loaded real Chase wheel must call original vibrate(18)');
    } else {
      assert.ok(evidence.impacts.some(i => i.speed > 2), 'Actual simulate collision report required');
      if (mode === 'android' && enabled) assert.ok(positive.some(c => c.accepted && c.pattern >= 25 && c.pattern <= 60
        && c.lastImpact?.phase === phase && c.lastImpact.speed > 2 && c.t - c.lastImpact.t < 50),
      'Actual impact must call the original vibration API');
    }
    if (!enabled || mode === 'iphone') assert.equal(positive.length, 0, 'Off/unsupported must remain quiet during the same physical contact');
  };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    report.api = await page.evaluate(() => ({ present: window.__phoneProbe.apiPresent, originalNative: window.__phoneProbe.originalNative }));
    assert.equal(report.api.present, mode === 'android', 'Use a browser with the real expected API; do not stub/delete it');
    if (mode === 'android') assert.ok(report.api.originalNative, 'Expected browser native navigator.vibrate');
    await page.locator('.mn-screen--title .mn-btn--primary').tap();
    await page.locator('[aria-label="Start time trial"]').tap();
    await page.waitForFunction(() => window.__game.race?.session.lights < 0, null, { timeout: 30000 });
    await page.evaluate(observeImpacts);
    for (const kind of ['kerb', 'impact']) for (const enabled of [true, false]) await runContact(kind, enabled);
    const calls = await page.evaluate(() => window.__phoneProbe.calls);
    report.pulses = checkPulses(calls); report.calls = calls;
    if (mode === 'iphone') assert.equal(calls.length, 0);
    report.persistence = { storedBeforeReload: await page.evaluate(() => {
      const raw = localStorage.getItem('bathurst.settings.v1');
      return raw ? JSON.parse(raw).phoneVibration : null;
    }) };
    assert.equal(report.persistence.storedBeforeReload, false, 'Off must be durably saved by the actual Settings menu');
    report.status = 'contacts-complete-before-reload';
    await writeFile(resolve(output, `${mode}-phone-vibration.json`), JSON.stringify(report, null, 2) + '\n');
    await page.reload();
    await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    report.persistence.loadedAfterReload = await page.evaluate(() => window.__game.settings.phoneVibration);
    assert.equal(report.persistence.loadedAfterReload, false, 'Off must load before any post-reload setting adjustment');
    assert.equal(await page.evaluate(() => window.__phoneProbe.apiPresent), mode === 'android');
    await page.locator('.mn-screen--title .mn-btn--primary').tap();
    await page.locator('[aria-label="Start time trial"]').tap();
    await page.waitForFunction(() => window.__game.race?.session.lights < 0, null, { timeout: 30000 });
    await page.evaluate(observeImpacts);
    for (const kind of ['kerb', 'impact']) await runContact(kind, false, '-reloaded');
    report.callsAfterReload = await page.evaluate(() => window.__phoneProbe.calls);
    assert.equal(report.callsAfterReload.length, 0, 'Persisted Off must remain silent through the same real kerb and impact');
    assert.deepEqual(errors, []); report.status = 'native-call-wiring-passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error);
    report.probeAtFailure = await page.evaluate(() => window.__phoneProbe).catch(() => null);
    await page.screenshot({ path: resolve(output, `${mode}-failure.png`), scale: 'css' }).catch(() => {});
    throw error;
  } finally {
    await writeFile(resolve(output, `${mode}-phone-vibration.json`), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
  console.log(JSON.stringify({ mode, status: report.status, api: report.api, pulses: report.pulses }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
