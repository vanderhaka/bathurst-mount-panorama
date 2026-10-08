#!/usr/bin/env node
// Native menus, all car/camera modes and a frozen scene capture for the new circuit.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, webkit } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';

const args = process.argv.slice(2), out = resolve(args[0] ?? 'artifacts/review/adelaide/browser');
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const url = option('--url', 'http://127.0.0.1:5181/?track=adelaide');
const engine = option('--engine', 'chromium'), mobile = args.includes('--mobile');
assert.ok(['chromium', 'webkit'].includes(engine));
await mkdir(out, { recursive: true });
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const context = await browser.newContext(mobile
  ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
  : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage(), prefix = `${engine}-${mobile ? 'phone' : 'desktop'}`;
const report = { engine, browser: browser.version(), mobile, url, errors: [], cars: [], corners: [], status: 'running',
  method: 'Native menu/button/key input. Preview teleport only for render captures; those laps are invalidated. No record or timer injection.',
  limitations: ['Desktop engines and phone emulation do not prove real iPhone toolbar, zoom, thermal or rotation behavior.'] };
page.setDefaultTimeout(15000);
page.on('pageerror', e => report.errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
await authenticatePreview(page, url);
const shot = name => page.screenshot({ path: resolve(out, `${prefix}-${name}.png`), scale: 'css' });
const frames = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const button = (screen, name) => page.locator(`.mn-screen--${screen}`).getByRole('button', { name, exact: true });
const activate = async locator => { if (mobile) await locator.tap(); else await locator.click(); await frames(); };
const waitReady = () => page.waitForFunction(() => window.__shotReady && window.__game?.state === 'title', null, { timeout: 90000 });
const pause = async () => { await frames(); await page.keyboard.press('Escape'); await page.waitForFunction(() => window.__game.state === 'paused'); };
try {
  await page.goto(url); await waitReady(); await page.waitForTimeout(400);
  const title = await page.evaluate(() => {
    const root = document.querySelector('.mn-screen--title'), rect = root.getBoundingClientRect();
    return { title: document.title, trackId: window.__game.world.track.id, lengthM: window.__game.world.track.length,
      facts: root.querySelector('.mn-facts').textContent, sideWidth: root.querySelector('.mn-side').getBoundingClientRect().width,
      bounds: [...root.querySelectorAll('h1, nav, .mn-tip')].map(e => { const b = e.getBoundingClientRect();
        return { text: e.textContent, left: b.left, right: b.right, top: b.top, bottom: b.bottom,
          fits: b.top >= rect.top - 1 && b.bottom <= rect.bottom + 1 && b.right <= rect.right + 1 }; }) };
  });
  assert.equal(title.trackId, 'adelaide'); assert.equal(title.lengthM, 3219);
  assert.ok(title.title.includes('Adelaide') && title.facts.includes('14'));
  assert.ok(title.bounds.every(b => b.fits), 'Title, menu and attribution must fit the viewport');
  report.title = title; await shot('title');
  const credit = page.getByRole('link', { name: 'Circuit data (ODbL)', exact: true });
  await credit.focus();
  const popupPromise = page.waitForEvent('popup'); await page.keyboard.press('Enter');
  const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded');
  assert.ok(popup.url().endsWith('/data/adelaide-centerline.json')); await popup.close();
  report.keyboardAttributionLink = true;
  for (const [i, car] of ['camaro', 'mustang', 'supra'].entries()) {
    await activate(button('title', 'Time trial'));
    if (i) await activate(page.locator('.mn-screen--car [aria-label="Next car"]'));
    await shot(`car-${car}`); await activate(button('car', 'Start time trial'));
    await page.waitForFunction(() => window.__game.state === 'race' && window.__game.race.session.lights < 0, null, { timeout: 30000 });
    const grid = await page.evaluate(() => { const g = window.__game, v = g.race.player.vehicle;
      return { car: g.race.session.car, circuit: g.world.track.id, s: v.tp.s, offset: v.tp.d, y: v.y, speed: v.speed,
        corners: g.race.session.telemetrySnapshot().corners.length, lights: g.race.session.lights }; });
    assert.equal(grid.car, car); assert.equal(grid.circuit, 'adelaide'); assert.equal(grid.corners, 14);
    assert.ok((await page.locator('.hud-timing__title').textContent()).includes('ADELAIDE'));
    assert.ok((await page.locator('.hud-map .hud-panel__head').textContent()).includes('ADELAIDE PARKLANDS'));
    assert.ok((await page.locator('.hud-map__alt').textContent()).includes('M (EST)'));
    assert.ok(grid.s > 80 && grid.s < 110 && Object.values(grid).filter(v => typeof v === 'number').every(Number.isFinite));
    await shot(`${car}-grid`);
    await page.keyboard.down('ArrowUp'); await page.waitForTimeout(1200); await page.keyboard.up('ArrowUp');
    assert.ok(await page.evaluate(() => window.__game.race.player.vehicle.speed > 1));
    const cameras = [];
    for (let j = 0; j < 5; j++) {
      const view = await page.evaluate(() => { const g = window.__game, c = g.stage.camera;
        return { mode: g.rig.mode, pose: [...c.position.toArray(), ...c.quaternion.toArray(), c.fov], circuit: g.world.track.id }; });
      assert.ok(view.pose.every(Number.isFinite)); cameras.push(view.mode);
      await shot(`${car}-${view.mode}`); await page.keyboard.press('c'); await page.waitForTimeout(180);
    }
    assert.equal(new Set(cameras).size, 5);
    await page.keyboard.down('v'); await frames();
    assert.equal(await page.evaluate(() => window.__game.rig.lookBack), true);
    await page.keyboard.up('v'); await pause();
    await activate(button('pause', 'Reset to track: repairs the car and invalidates the lap'));
    await page.waitForFunction(() => window.__game.state === 'race');
    assert.equal(await page.evaluate(() => window.__game.race.session.timer.valid), false);
    report.cars.push({ ...grid, cameras, keyboardDrive: true, resetInvalidatesLap: true });
    if (i === 2) {
      const corners = await page.evaluate(() => window.__game.world.track.corners);
      for (const corner of corners) {
        await page.evaluate(s => { const g = window.__game; g.debugTeleport(s - 42); g.rig.mode = 'chase'; g.rig.snap(); }, corner.s);
        await page.waitForTimeout(250);
        const state = await page.evaluate(() => { const g = window.__game, v = g.race.player.vehicle;
          return { s: v.tp.s, x: v.x, y: v.y, z: v.z, valid: g.race.session.timer.valid }; });
        assert.ok([state.s, state.x, state.y, state.z].every(Number.isFinite)); assert.equal(state.valid, false);
        report.corners.push({ turn: corner.turn, name: corner.name, ...state }); await shot(`turn-${corner.turn}`);
      }
    }
    await pause(); await activate(button('pause', 'Quit to menu')); await waitReady();
  }
  const nextCircuit = page.locator('.mn-screen--title [aria-label="Next circuit"]');
  await Promise.all([page.waitForURL(next => !next.searchParams.has('track')),
    mobile ? nextCircuit.tap() : nextCircuit.click()]);
  await waitReady();
  const bathurst = await page.evaluate(() => ({ id: window.__game.world.track.id, length: window.__game.world.track.length, title: document.title }));
  assert.equal(bathurst.id, 'bathurst'); assert.equal(bathurst.length, 6213); assert.ok(bathurst.title.includes('Panorama'));
  report.defaultCircuit = bathurst; await shot('switched-bathurst');
  await activate(button('title', 'Time trial')); await activate(button('car', 'Start time trial'));
  await page.waitForFunction(() => window.__game.race?.session.lights < 0, null, { timeout: 30000 });
  assert.equal(await page.evaluate(() => window.__game.race.session.telemetrySnapshot().corners.length), 23);
  report.bathurstRaceStarts = true;
  assert.deepEqual(report.errors, []); report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error); await shot('failure').catch(() => {}); throw error;
} finally {
  await writeFile(resolve(out, `${prefix}.json`), JSON.stringify(report, null, 2) + '\n'); await browser.close();
}
console.log(JSON.stringify({ status: report.status, engine, mobile, cars: report.cars.length, corners: report.corners.length, errors: report.errors }));
