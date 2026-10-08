#!/usr/bin/env node
// Native menu taps; Chrome held input is native CDP, WebKit routing is synthetic.
// Sensor/permission responses are explicit fixtures, never physical iPhone proof.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { browserTouches } from './browser-touch.mjs';
import { authenticatePreview } from './browser-auth.mjs';
import { answerSteerQuestion } from './steer-question.mjs';

const engine = process.argv[2] ?? 'chromium';
const url = process.argv[3] ?? 'http://127.0.0.1:5181/';
const output = resolve(process.argv[4] ?? 'artifacts/review/item-2.7');
await mkdir(output, { recursive: true });
const browser = engine === 'webkit' ? await webkit.launch()
  : await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 },
  hasTouch: true, isMobile: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await context.addInitScript(() => {
  window.__orientationRequests = [];
  window.__orientationPermission = 'granted';
  const api = window.DeviceOrientationEvent ?? function() {};
  api.requestPermission = () => {
    window.__orientationRequests.push({ activeTap: navigator.userActivation.isActive });
    return Promise.resolve(window.__orientationPermission);
  };
  window.DeviceOrientationEvent = api;
});
const page = await context.newPage();
await authenticatePreview(page, url);
const errors = [], results = {};
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const ready = () => page.waitForFunction(() => window.__shotReady, null, { timeout: 90000 });
const start = async () => {
  await page.locator('.mn-screen--title .mn-btn--primary').tap();
  await page.waitForTimeout(400);
  await page.locator('[aria-label="Start time trial"]').tap();
  await answerSteerQuestion(page);
  await page.waitForFunction(() => window.__game.race?.session.lights < 0);
};
const controls = () => page.evaluate(() => window.__game.input.update(0));
const point = async (selector, fraction = 0.5) => {
  const b = await page.locator(selector).boundingBox();
  assert.ok(b, `Visible control: ${selector}`);
  return [b.x + b.width / 2, b.y + b.height * fraction];
};
const options = async fields => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game.state === 'paused');
  await page.waitForTimeout(300);
  await page.locator('.mn-screen--pause .mn-btn:has-text("Settings")').tap();
  await page.locator('[role="tab"]:has-text("Steering")').tap();
  for (const [key, label, value] of fields) {
    for (let i = 0; await page.evaluate(key => window.__game.settings[key], key) !== value; i++) {
      assert.ok(i < 4);
      await page.locator(`[aria-label="Next ${label.toLowerCase()}"]`).tap();
    }
  }
  await page.screenshot({ path: resolve(output, `${engine}-settings.png`) });
  await page.locator('.mn-screen--settings .mn-btn:has-text("Done")').tap();
  await page.waitForTimeout(300);
  await page.locator('.mn-screen--pause .mn-btn:has-text("Resume")').tap();
  await page.waitForTimeout(200);
};
try {
  await page.goto(url);
  await ready();
  const cdp = engine === 'chromium' ? await context.newCDPSession(page) : null;
  let touch = await browserTouches(page, cdp);
  await start();
  await options([['touchAnalogThrottle', 'Analog throttle', true]]);
  const pedal = await point('.tc-pedal--throttle', 0.97);
  await touch.touch('start', [[200, 280], pedal]);
  await touch.touch('move', [[245, 280], pedal]);
  await page.waitForTimeout(250);
  results.analogBottom = await controls();
  assert.ok(results.analogBottom.throttle < 0.1 && results.analogBottom.steer < -0.2);
  for (const [name, fraction] of [['analogMiddle', 0.5], ['analogTop', 0.03]]) {
    await touch.touch('move', [[245, 280], await point('.tc-pedal--throttle', fraction)]);
    await page.waitForTimeout(250);
    results[name] = await controls();
    assert.ok(Math.abs(results[name].throttle - (1 - fraction)) < 0.08);
  }
  await page.screenshot({ path: resolve(output, `${engine}-drag-analog.png`) });
  await touch.touch('end');
  await options([['touchMode', 'Touch steering mode', 'buttons'], ['touchLeftHanded', 'Left-handed layout', true]]);
  const layout = await page.evaluate(() => ({ steer: document.querySelector('.tc-steer').getBoundingClientRect().x,
    pedal: document.querySelector('.tc-pedals').getBoundingClientRect().x }));
  assert.ok(layout.steer > layout.pedal);
  await touch.touch('start', [await point('.tc-arrow--left'), await point('.tc-pedal--throttle', 0.03)]);
  await page.waitForTimeout(400);
  results.buttons = await controls();
  assert.ok(results.buttons.steer > 0.8 && results.buttons.throttle > 0.8);
  await page.screenshot({ path: resolve(output, `${engine}-buttons-mirrored.png`) });
  await touch.touch('end');
  await options([['touchAutoThrottle', 'Auto-throttle', true]]);
  await page.waitForTimeout(300);
  results.auto = await controls();
  assert.ok(results.auto.throttle > 0.9);
  await touch.touch('start', [await point('.tc-pedal--brake')]);
  await page.waitForTimeout(120);
  results.autoBrake = await controls();
  assert.equal(results.autoBrake.throttle, 0);
  assert.ok(results.autoBrake.brake > 0.7);
  await touch.touch('end');
  await options([['touchAutoThrottle', 'Auto-throttle', false], ['touchLeftHanded', 'Left-handed layout', false], ['touchMode', 'Touch steering mode', 'tilt']]);
  assert.equal(await page.evaluate(() => window.__orientationRequests.length), 0);
  await page.locator('.tc-tilt-enable').tap();
  assert.deepEqual(await page.evaluate(() => window.__orientationRequests), [{ activeTap: true }]);
  await page.evaluate(() => {
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    window.__sensorBeta = a === 90 || a === 270 ? 0 : a === 180 ? -60 : 60;
    window.__sensorGamma = a === 90 ? 90 : a === 270 ? -90 : 0;
    window.__sensorTimer = setInterval(() => window.dispatchEvent(Object.assign(new Event('deviceorientation'),
      { beta: window.__sensorBeta, gamma: window.__sensorGamma })), 30);
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const a = screen.orientation?.angle ?? window.orientation ?? 0;
    if (a === 90 || a === 270) window.__sensorBeta = a === 90 ? 24 : -24;
    else window.__sensorGamma = a === 180 ? 24 : -24;
  });
  await page.waitForTimeout(300);
  results.tilt = await controls();
  assert.ok(results.tilt.steer > 0.2);
  await page.screenshot({ path: resolve(output, `${engine}-tilt.png`) });
  await page.evaluate(() => clearInterval(window.__sensorTimer));
  await page.waitForTimeout(800);
  assert.equal((await controls()).steer, 0);
  await page.reload();
  await ready();
  assert.equal(await page.evaluate(() => window.__game.settings.touchMode), 'tilt');
  assert.equal(await page.evaluate(() => window.__orientationRequests.length), 0);
  touch = await browserTouches(page, cdp);
  await start();
  await page.evaluate(() => { window.__orientationPermission = 'denied'; });
  await page.locator('.tc-tilt-enable').tap();
  await page.waitForTimeout(100);
  await touch.touch('start', [[200, 280]]);
  await touch.touch('move', [[245, 280]]);
  results.deniedDrag = await controls();
  assert.ok(results.deniedDrag.steer < -0.2);
  assert.ok((await page.locator('.tc-sensor__note').textContent()).includes('Permission off'));
  await touch.touch('cancel');
  await page.screenshot({ path: resolve(output, `${engine}-denied-fallback.png`) });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, `${engine}-options.json`), JSON.stringify({ engine, touchMethod: touch.method,
    sensorMethod: 'synthetic permission/gravity fixtures; native activation tap', results, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ engine, results, errors }));
} finally { await browser.close(); }
