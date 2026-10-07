#!/usr/bin/env node
// Scripted play-through for verification. Drives the real game with keyboard
// events and takes screenshots.
// Usage: node scripts/play.mjs <scenario.json> [--url http://127.0.0.1:5180/] [--size 1600x900] [--mobile]
// Scenario: [{ "key": "Enter" } | { "down": "ArrowUp" } | { "up": "ArrowUp" } | { "wait": 1500 }
//            | { "shot": "artifacts/x.png" } | { "eval": "js expression" } | { "waitFor": "js expression" }
//            | { "tap": [x, y] } | { "tapOn": "css selector" } | { "viewport": [w, h] }
//            | { "touch": "start" | "move" | "end", "points": [[x, y], ...] } | { "pinch": [x, y, scale] }]
// --mobile emulates an iPhone (touch screen, 3x pixels, mobile user agent); "touch" sends real
// multi-finger touch events (Chrome DevTools protocol), one point per finger in a fixed order.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const scenarioPath = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const url = opt('url', 'http://127.0.0.1:5180/');
const [w, h] = opt('size', '1600x900').split('x').map(Number);
const steps = JSON.parse(readFileSync(scenarioPath, 'utf8'));

const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const mobile = args.includes('--mobile');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const context = await browser.newContext(mobile
  ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: IPHONE_UA }
  : { viewport: { width: w, height: h } });
const page = await context.newPage();
const cdp = mobile ? await context.newCDPSession(page) : null;
const TOUCH = { start: 'touchStart', move: 'touchMove', end: 'touchEnd', cancel: 'touchCancel' };
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 90000 });
const log = [];
for (const s of steps) {
  if (s.key) await page.keyboard.press(s.key);
  else if (s.down) await page.keyboard.down(s.down);
  else if (s.up) await page.keyboard.up(s.up);
  else if (s.wait) await page.waitForTimeout(s.wait);
  else if (s.waitFor) await page.waitForFunction(s.waitFor, null, { timeout: s.timeout ?? 60000, polling: 100 });
  else if (s.eval) log.push({ eval: s.eval, result: await page.evaluate(s.eval) });
  else if (s.tap) await page.touchscreen.tap(s.tap[0], s.tap[1]);
  else if (s.tapOn) {
    const box = await page.locator(s.tapOn).first().boundingBox();
    if (!box) throw new Error(`tapOn: ${s.tapOn} is not visible`);
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else if (s.viewport) await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] });
  else if (s.pinch) await cdp.send('Input.synthesizePinchGesture', { x: s.pinch[0], y: s.pinch[1], scaleFactor: s.pinch[2], gestureSourceType: 'touch' });
  else if (s.touch) {
    const touchPoints = s.touch === 'end' || s.touch === 'cancel' ? [] : s.points.map(([x, y], id) => ({ x, y, id }));
    await cdp.send('Input.dispatchTouchEvent', { type: TOUCH[s.touch], touchPoints });
  }
  else if (s.shot) {
    mkdirSync(dirname(s.shot), { recursive: true });
    await page.screenshot({ path: s.shot });
    log.push({ shot: s.shot });
  }
}
console.log(JSON.stringify({ log, errors: errors.slice(0, 20) }, null, 1));
await browser.close();
