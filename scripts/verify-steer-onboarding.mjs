#!/usr/bin/env node
// The one-time steering question on a phone (src/ui/screens/steer-onboarding.ts): asked before the
// first race; Finger, Tilt granted, Tilt refused, keyboard, rotating mid-question, reload, desktop and
// players who already changed the touch mode. Native taps; run it on both engines.
// Usage: node scripts/verify-steer-onboarding.mjs <chromium|webkit> [url] [outDir]
// Motion access answers are explicit fixtures (requestPermission is stubbed and the user activation at
// the call is recorded). They do not establish the native iPhone prompt or a physical sensor.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';
import { acceptFirstRaceSetup } from './steer-question.mjs';

const engine = process.argv[2] ?? 'chromium';
const url = process.argv[3] ?? 'http://127.0.0.1:5181/';
const output = resolve(process.argv[4] ?? 'artifacts/review/steer-onboarding');
await mkdir(output, { recursive: true });
const browser = engine === 'webkit' ? await webkit.launch()
  : await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const KEY = 'bathurst.settings.v1';
const errors = [], report = { engine, cases: {} };

/** A fresh phone (or desktop when `size` has no touch) at its first visit. */
async function open({ size = [844, 390], permission, seed, desktop = false }) {
  const context = await browser.newContext(desktop ? { viewport: { width: size[0], height: size[1] } }
    : { viewport: { width: size[0], height: size[1] }, hasTouch: true, isMobile: true, deviceScaleFactor: 3, userAgent: IPHONE });
  // Chrome shows the page any controller on this computer: a person playing at the same time would steer the test.
  await context.addInitScript(() => { navigator.getGamepads = () => []; });
  if (permission) {
    await context.addInitScript((answer) => {
      window.__orientationRequests = [];
      const api = window.DeviceOrientationEvent ?? function() {};
      api.requestPermission = () => {
        window.__orientationRequests.push({ activeTap: navigator.userActivation.isActive });
        return Promise.resolve(answer);
      };
      window.DeviceOrientationEvent = api;
    }, permission);
  }
  if (seed) await context.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [KEY, JSON.stringify(seed)]);
  const page = await context.newPage();
  await authenticatePreview(page, url);
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
  const press = (locator) => (desktop ? locator.click() : locator.tap());
  return {
    context, page, size,
    async toStart() {
      await press(page.locator('.mn-screen--title .mn-btn--primary'));
      await page.waitForTimeout(400);
      await press(page.locator('[aria-label="Start time trial"]'));
      await acceptFirstRaceSetup(page); // the first race setup screen comes before the steering question
    },
    press,
    shot: (name) => page.screenshot({ path: resolve(output, `${engine}-${size.join('x')}-${name}.png`) }),
    asking: () => page.evaluate(() => { const s = document.querySelector('.mn-screen--steer'); return !!s && !s.hidden; }),
    lights: () => page.waitForFunction(() => window.__game.state === 'race' && window.__game.race?.session.lights < 0, null, { timeout: 30000 }),
    settings: () => page.evaluate((key) => ({ live: { mode: window.__game.settings.touchMode, onboarded: window.__game.settings.steerOnboarded },
      saved: JSON.parse(localStorage.getItem(key) ?? 'null') }), KEY),
    focus: () => page.evaluate(() => document.activeElement?.getAttribute('data-steer-choice') ?? document.activeElement?.textContent),
  };
}
const asDrag = (s) => { assert.equal(s.live.mode, 'drag'); assert.equal(s.live.onboarded, true); assert.equal(s.saved.touchMode, 'drag'); assert.equal(s.saved.steerOnboarded, true); };

try {
  for (const size of [[844, 390], [568, 320]]) {
    const tag = size.join('x');
    // Finger: the question, its layout, the first drive, then a reload that does not ask again.
    const a = await open({ size });
    await a.toStart();
    assert.ok(await a.asking(), 'The first Start time trial asks how to steer');
    assert.equal(await a.page.evaluate(() => window.__game.state === 'race'), false, 'No race before the answer');
    assert.equal(await a.focus(), 'drag', 'Focus lands on Finger');
    await a.page.waitForTimeout(500);
    const layout = await a.page.evaluate(() => {
      const box = (sel) => document.querySelector(sel).getBoundingClientRect();
      const panel = box('.mn-panel--steer');
      return { panel: { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom },
        choiceHeights: [...document.querySelectorAll('.mn-steer__choice')].map((el) => el.getBoundingClientRect().height),
        helpPx: parseFloat(getComputedStyle(document.querySelector('.mn-steer__help')).fontSize),
        text: document.querySelector('.mn-screen--steer').innerText, viewport: [innerWidth, innerHeight] };
    });
    assert.ok(layout.panel.left >= 0 && layout.panel.right <= layout.viewport[0] && layout.panel.top >= 0 && layout.panel.bottom <= layout.viewport[1], 'Panel fits the screen');
    assert.ok(layout.choiceHeights.every((h) => h >= 44), `Tap targets are at least 44 px: ${layout.choiceHeights}`);
    assert.ok(layout.helpPx >= 8, `Readable help text: ${layout.helpPx}px`);
    await a.shot('question');
    await a.press(a.page.locator('[data-steer-choice="drag"]'));
    await a.lights();
    asDrag(await a.settings());
    await a.page.keyboard.down('ArrowUp'); await a.page.waitForTimeout(1200); await a.page.keyboard.up('ArrowUp');
    const speed = await a.page.evaluate(() => window.__game.race.player.vehicle.speed);
    assert.ok(speed > 1, `Drives after Finger: ${speed}`);
    await a.page.reload();
    await a.page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    await a.toStart();
    await a.lights();
    assert.equal(await a.asking(), false, 'Never asked again after a reload');
    report.cases[`finger-${tag}`] = { layout: { ...layout, text: layout.text.replace(/\s+/g, ' ') }, speed };
    await a.context.close();
  }

  // Tilt granted: the request runs inside the tap, the race starts in tilt mode, centred, with no Enable tilt hunt.
  const tilt = await open({ permission: 'granted' });
  await tilt.toStart();
  await tilt.press(tilt.page.locator('[data-steer-choice="tilt"]'));
  await tilt.lights();
  const requests = await tilt.page.evaluate(() => window.__orientationRequests);
  assert.deepEqual(requests, [{ activeTap: true }], 'Motion access is requested once, inside the tap');
  const granted = await tilt.settings();
  assert.equal(granted.live.mode, 'tilt'); assert.equal(granted.saved.touchMode, 'tilt'); assert.equal(granted.saved.steerOnboarded, true);
  const driven = await tilt.page.evaluate(async () => {
    const g = window.__game, t = g.input.touch.tilt;
    const reading = (beta) => window.dispatchEvent(Object.assign(new Event('deviceorientation'), { beta, gamma: 90 }));
    reading(30); // the pose held when the race starts is the centre
    const centred = g.input.update(0.05).steer, ready = t.ready;
    reading(54);
    const turned = g.input.update(0.2).steer;
    await new Promise((r) => setTimeout(r, 120));
    return { status: t.status, ready, centred, turned, mode: document.querySelector('.bx-touch').dataset.mode, button: document.querySelector('.tc-tilt-enable').textContent };
  });
  assert.equal(driven.status, 'granted'); assert.ok(driven.ready); assert.ok(Math.abs(driven.centred) < 0.05, 'Starts centred');
  assert.ok(Math.abs(driven.turned) > 0.8, 'Tilting steers'); assert.equal(driven.mode, 'tilt'); assert.equal(driven.button, 'Centre tilt');
  await tilt.shot('tilt-driving');
  report.cases.tiltGranted = { requests, ...driven };
  await tilt.context.close();

  // Tilt refused: Finger is saved, the player is told, the race waits for Start.
  const denied = await open({ permission: 'denied' });
  await denied.toStart();
  await denied.press(denied.page.locator('[data-steer-choice="tilt"]'));
  await denied.page.waitForFunction(() => document.querySelector('.mn-screen--steer .mn-help').textContent.includes('Motion access is off'));
  assert.equal(await denied.page.evaluate(() => window.__game.state === 'race'), false, 'No race until Start');
  asDrag(await denied.settings());
  const note = await denied.page.evaluate(() => document.querySelector('.mn-screen--steer .mn-help').textContent);
  assert.equal(note, 'Motion access is off — using Finger. Change it in Settings > Steering.');
  assert.equal(await denied.focus(), 'Start');
  await denied.page.waitForTimeout(300);
  await denied.shot('denied');
  await denied.press(denied.page.locator('.mn-screen--steer .mn-btn--primary'));
  await denied.lights();
  report.cases.tiltDenied = { note };
  await denied.context.close();

  // Keyboard and controller navigation, Back, and rotating the phone while the question is up.
  const keys = await open({});
  await keys.toStart();
  await keys.page.keyboard.press('ArrowRight');
  assert.equal(await keys.focus(), 'tilt');
  await keys.page.keyboard.press('ArrowLeft');
  assert.equal(await keys.focus(), 'drag');
  await keys.page.setViewportSize({ width: 390, height: 844 });
  await keys.page.waitForTimeout(500);
  assert.ok(await keys.asking(), 'Rotating to portrait leaves the question open');
  assert.equal(await keys.page.evaluate(() => window.__game.state === 'race'), false);
  await keys.page.setViewportSize({ width: 844, height: 390 });
  await keys.page.waitForTimeout(500);
  await keys.page.keyboard.press('Escape');
  assert.equal(await keys.page.evaluate(() => document.querySelector('.bx-menus').dataset.screen), 'car', 'Back returns to car select');
  assert.equal((await keys.settings()).live.onboarded, false, 'Backing out is not a choice');
  await keys.press(keys.page.locator('[aria-label="Start time trial"]')); // Safari does not focus a tapped button
  await acceptFirstRaceSetup(keys.page); // no-op if backing out left the setup already accepted
  assert.ok(await keys.asking(), 'Asked again after backing out');
  await keys.page.keyboard.press('Enter');
  await keys.lights();
  asDrag(await keys.settings());
  await keys.page.setViewportSize({ width: 390, height: 844 });
  await keys.page.waitForTimeout(600);
  assert.equal(await keys.page.evaluate(() => window.__game.state), 'paused', 'Portrait still pauses the race');
  report.cases.keyboardAndRotation = 'ok';
  await keys.context.close();

  // Desktop never sees it; a player who already changed the mode is not asked.
  const desktop = await open({ size: [1280, 720], desktop: true });
  await desktop.toStart();
  await desktop.lights();
  assert.equal(await desktop.asking(), false);
  assert.equal((await desktop.settings()).live.onboarded, false);
  report.cases.desktop = 'never asked';
  await desktop.context.close();
  const veteran = await open({ seed: { touchMode: 'buttons' } });
  await veteran.toStart();
  await veteran.lights();
  assert.equal(await veteran.asking(), false);
  assert.equal((await veteran.settings()).live.mode, 'buttons');
  report.cases.existingButtonsPlayer = 'never asked';
  await veteran.context.close();
  report.status = 'pass';
} finally {
  report.errors = errors;
  await writeFile(resolve(output, `${engine}-steer-onboarding.json`), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}
console.log(JSON.stringify(report));
if (errors.length) process.exitCode = 1;
