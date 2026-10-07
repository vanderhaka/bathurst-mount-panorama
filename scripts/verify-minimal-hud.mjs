#!/usr/bin/env node
// Real menu taps; live physics reads only. No car/telemetry or settings injection.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, webkit } from 'playwright';

export function unionArea(rectangles) {
  const rects = rectangles.filter(r => r.width > 0 && r.height > 0);
  const xs = [...new Set(rects.flatMap(r => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const intervals = rects.filter(r => r.x < xs[i] && r.x + r.width > xs[i - 1])
      .map(r => [r.y, r.y + r.height]).sort((a, b) => a[0] - b[0]);
    let start = intervals[0]?.[0] ?? 0, end = start, length = 0;
    for (const [a, b] of intervals) {
      if (a > end) { length += end - start; start = a; end = b; }
      else end = Math.max(end, b);
    }
    area += (xs[i] - xs[i - 1]) * (length + end - start);
  }
  return area;
}

function readHud() {
  const game = window.__game, race = game.race, v = race.player.vehicle, track = v.track;
  const hud = document.querySelector('.bx-hud');
  const visible = el => {
    if (!el) return false;
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.display === 'none' || s.visibility !== 'visible' || Number(s.opacity) <= .001) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const blocks = [...hud.children].flatMap(el => el.classList.contains('hud-region') ? [...el.children] : [el]);
  const rects = blocks.filter(visible).map(el => {
    const r = el.getBoundingClientRect();
    const x = Math.max(0, r.left), y = Math.max(0, r.top);
    return { name: el.className, x, y, width: Math.max(0, Math.min(innerWidth, r.right) - x),
      height: Math.max(0, Math.min(innerHeight, r.bottom) - y),
      fullyInside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };
  }).filter(r => r.width > 0 && r.height > 0);
  const text = selector => document.querySelector(selector)?.textContent.trim() ?? null;
  const lapS = race.session.timer.snapshot(race.session.lapDist()).currentS;
  const ms = Math.floor(Math.max(0, lapS) * 1000 + 1e-6);
  const expectedTime = `${Math.floor(ms / 60000)}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  const expectedSpeed = Math.max(0, Math.round(Math.abs(v.telemetry.speed) * 3.6 / (game.settings.units === 'mph' ? 1.609344 : 1)));
  const expectedGear = v.telemetry.gear < 0 ? 'R' : v.telemetry.gear === 0 ? 'N' : String(v.telemetry.gear);
  // Independent world-to-map projection from the current track and actual map size.
  const outline = Array.from(track.px, (x, i) => [x, track.pz[i]]);
  const bounds = angle => {
    const c = Math.cos(angle), s = Math.sin(angle), xs = [], ys = [];
    for (const [x, z] of outline) { xs.push(x * c - z * s); ys.push(x * s + z * c); }
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  };
  let angle = 0, best = -Infinity;
  for (let deg = 0; deg < 180; deg++) {
    const b = bounds(deg * Math.PI / 180), k = Math.min(1.5 / (b[1] - b[0]), 1 / (b[3] - b[2]));
    if (k > best + 1e-9) { best = k; angle = deg * Math.PI / 180; }
  }
  const view = document.querySelector('.hud-map__view'), b = bounds(angle);
  const width = view.clientWidth, height = view.clientHeight, pad = Math.max(8, width * .05);
  const scale = Math.min((width - 2 * pad) / (b[1] - b[0]), (height - 2 * pad) / (b[3] - b[2]));
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const expectedMap = [(v.x * cos - v.z * sin - (b[0] + b[1]) / 2) * scale + width / 2,
    (v.x * sin + v.z * cos - (b[2] + b[3]) / 2) * scale + height / 2];
  const transform = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.hud-map__car')).transform);
  const rotation = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.hud-map__arrow')).transform);
  const expectedAngle = Math.atan2(Math.sin(v.heading) * cos - Math.cos(v.heading) * sin,
    -(Math.sin(v.heading) * sin + Math.cos(v.heading) * cos)) * 180 / Math.PI;
  return { viewport: [innerWidth, innerHeight], size: hud.dataset.size, view: hud.dataset.view,
    camera: game.rig.mode, units: game.settings.units, rects,
    speed: text('.hud-minimal__speed b'), unit: text('.hud-minimal__speed span'),
    gear: text('.hud-minimal__gear b'), lapTime: text('.hud-minimal__lap b'),
    expectedSpeed, expectedGear, expectedTime, lapS, speedMps: v.telemetry.speed,
    playerXZ: [v.x, v.z], map: [transform.m41, transform.m42], expectedMap,
    mapAngle: Math.atan2(rotation.m12, rotation.m11) * 180 / Math.PI, expectedAngle,
    arrowVisible: visible(document.querySelector('.hud-map__arrow')),
    extraMapVisible: ['.hud-map__foot', '.hud-map__ghost', '.hud-map .hud-panel__head'].filter(s => visible(document.querySelector(s))) };
}

async function main() {
  const engine = process.argv[2] ?? 'webkit', url = process.argv[3] ?? 'http://127.0.0.1:5181/';
  assert.ok(['chromium', 'webkit'].includes(engine), 'Engine must be chromium or webkit');
  const output = resolve(process.argv[4] ?? '/private/tmp/bathurst-item-2.8-acceptance');
  await mkdir(output, { recursive: true });
  const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome',
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true,
    isMobile: true, deviceScaleFactor: 3,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  const page = await context.newPage(), errors = [], report = { engine, browser: browser.version(),
    targetOrigin: new URL(url).origin, status: 'running', samples: [], errors,
    fixtures: ['844×390 CSS px; DPR 3; iPhone UA; touch enabled; isolated empty storage',
      'Native Playwright menu taps; native keyboard throttle; read-only __game verification hook'],
    limitations: ['Rectangles conservatively include panel backgrounds; CSS shadows are outside this measure.',
      'DOM union excludes touch controls and 3D cockpit/dashboard; screenshots must be inspected.',
      'Desktop WebKit/Chrome emulation does not prove physical iPhone safe-area/device rendering.'] };
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  if (process.env.VERCEL_OIDC_TOKEN) await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== new URL(url).origin) return route.continue();
    return route.continue({ headers: { ...route.request().headers(),
      'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN } });
  });
  const choose = async (key, label, value) => {
    for (let i = 0; await page.evaluate(k => window.__game.settings[k], key) !== value; i++) {
      assert.ok(i < 8, `Setting not available: ${key}`);
      await page.locator(`[aria-label="Next ${label.toLowerCase()}"]`).tap();
    }
    const row = page.locator('.mn-value').filter({ has: page.locator('.mn-value__label', { hasText: new RegExp(`^${label}$`) }) });
    assert.equal(await row.getAttribute('data-value'), String(value));
  };
  const display = async (fields, photo) => {
    await page.locator('.tc-btn--pause').tap();
    await page.waitForFunction(() => window.__game.state === 'paused');
    await page.locator('.mn-screen--pause .mn-btn:has-text("Settings")').tap();
    await page.locator('[role="tab"]:has-text("Display")').tap();
    for (const field of fields) await choose(...field);
    if (photo) await page.screenshot({ path: resolve(output, `${engine}-${photo}.png`), scale: 'css' });
    await page.locator('.mn-screen--settings .mn-btn:has-text("Done")').tap();
    await page.locator('.mn-screen--pause .mn-btn:has-text("Resume")').tap();
    await page.waitForFunction(() => window.__game.state === 'race');
    await page.waitForTimeout(250);
  };
  const camera = async value => {
    for (let i = 0; await page.evaluate(() => window.__game.rig.mode) !== value; i++) {
      assert.ok(i < 6, `Camera unavailable: ${value}`);
      await page.locator('.tc-btn--camera').tap();
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(350);
  };
  try {
    await page.goto(url);
    await page.waitForFunction(() => window.__shotReady && window.__game, null, { timeout: 90000 });
    await page.locator('.mn-screen--title .mn-btn--primary').tap();
    await page.locator('[aria-label="Start time trial"]').tap();
    await page.waitForFunction(() => window.__game.race?.session.lights < 0, null, { timeout: 30000 });
    await display([['hudSize', 'HUD size', 'full'], ['units', 'Speed units', 'kmh']], 'settings-full');
    await camera('chase');
    await page.keyboard.down('ArrowUp');
    try { await page.waitForFunction(() => window.__game.race.player.vehicle.speed > 8, null, { timeout: 10000 }); }
    finally { await page.keyboard.up('ArrowUp'); }
    // Keyboard input hides touch controls; restore touch with a native tap.
    await page.touchscreen.tap(420, 120); await page.waitForTimeout(100);
    const before = await page.evaluate(readHud);
    before.unionArea = unionArea(before.rects); before.coverage = before.unionArea / (844 * 390);
    report.full = before;
    await page.screenshot({ path: resolve(output, `${engine}-full-before.png`), scale: 'css' });
    for (const view of ['chase', 'cockpit']) for (const units of ['kmh', 'mph']) {
      await display([['hudSize', 'HUD size', 'minimal'], ['units', 'Speed units', units]], `settings-minimal-${view}-${units}`);
      await camera(view);
      const a = await page.evaluate(readHud);
      await page.waitForTimeout(750);
      const b = await page.evaluate(readHud);
      b.name = `${view}-${units}`; b.unionArea = unionArea(b.rects); b.coverage = b.unionArea / (844 * 390);
      b.movementM = Math.hypot(b.playerXZ[0] - a.playerXZ[0], b.playerXZ[1] - a.playerXZ[1]);
      report.samples.push(b);
      assert.deepEqual(b.viewport, [844, 390]); assert.equal(b.size, 'minimal');
      assert.equal(b.camera, view); assert.equal(b.view, view === 'cockpit' ? 'cockpit' : 'outside');
      assert.equal(b.units, units); assert.equal(b.rects.length, 2);
      assert.ok(b.rects.every(r => r.fullyInside && /hud-map|hud-minimal/.test(r.name)));
      assert.ok(b.coverage > 0 && b.coverage < .1, `HUD covers ${(b.coverage * 100).toFixed(2)}%`);
      assert.equal(b.speed, String(b.expectedSpeed)); assert.equal(b.gear, b.expectedGear);
      assert.equal(b.unit, units === 'mph' ? 'MPH' : 'KM/H'); assert.equal(b.lapTime, b.expectedTime);
      assert.ok(Math.abs(b.speedMps) > 1 && b.movementM > .5 && b.lapS > a.lapS + .1);
      assert.ok(b.arrowVisible); assert.deepEqual(b.extraMapVisible, []);
      assert.ok(Math.hypot(b.map[0] - b.expectedMap[0], b.map[1] - b.expectedMap[1]) < .4);
      assert.ok(Math.abs((b.mapAngle - b.expectedAngle + 540) % 360 - 180) < 1.2);
      await page.screenshot({ path: resolve(output, `${engine}-minimal-${view}-${units}.png`), scale: 'css' });
    }
    await display([['hudSize', 'HUD size', 'full']], 'settings-restored-full');
    assert.equal(await page.locator('.bx-hud').getAttribute('data-size'), 'full');
    assert.equal(await page.locator('.hud-minimal').isVisible(), false);
    await page.screenshot({ path: resolve(output, `${engine}-full-restored.png`), scale: 'css' });
    assert.deepEqual(errors, []); report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error);
    await page.screenshot({ path: resolve(output, `${engine}-failure.png`), scale: 'css' }).catch(() => {});
    throw error;
  } finally {
    await writeFile(resolve(output, `${engine}-minimal-hud.json`), JSON.stringify(report, null, 2) + '\n');
    await browser.close();
  }
  console.log(JSON.stringify({ engine, status: report.status, samples: report.samples.map(x => ({ name: x.name, coverage: x.coverage })) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
