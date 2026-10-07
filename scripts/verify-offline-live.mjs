#!/usr/bin/env node
// Verify a protected, immutable preview using its real installed worker.
// Supply VERCEL_OIDC_TOKEN through an ignored env file, never a command argument.
import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const url = new URL(process.argv[2]);
assert.ok(url.protocol === 'https:' && url.hostname.endsWith('.vercel.app'));
assert.ok(process.env.VERCEL_OIDC_TOKEN, 'Load the existing preview credentials privately.');
const output = resolve(process.argv[3] ?? 'artifacts/review/item-2.6');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  extraHTTPHeaders: { 'x-vercel-trusted-oidc-idp-token': process.env.VERCEL_OIDC_TOKEN } });
// The emitted worker manifest also contains only same-origin game files.
await context.route('**/*', route => new URL(route.request().url()).origin === url.origin
  ? route.continue() : route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
try {
  await page.goto(url.href);
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 90000 });
  assert.ok((await page.title()).includes('Panorama'));
  await page.waitForFunction(async () => !!navigator.serviceWorker.controller &&
    (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
  const manifest = await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('bathurst-game-'));
    return (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname);
  });
  assert.equal(manifest.filter(path => path.endsWith('.woff')).length, 4);
  assert.ok(manifest.some(path => path.includes('engine-processor-')));
  assert.ok(!manifest.some(path => path.startsWith('/harness/')));
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 90000 });
  await page.locator('.mn-screen--title .mn-btn--primary').tap();
  await page.waitForTimeout(500);
  await page.locator('[aria-label="Start time trial"]').tap();
  await page.waitForFunction(() => window.__game?.race?.session.lights < 0, null, { timeout: 30000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction(() => window.__game.audio?.ready, null, { timeout: 10000 });
  const proof = await page.evaluate(async () => ({
    online: navigator.onLine, controlled: !!navigator.serviceWorker.controller,
    caches: await caches.keys(), state: window.__game.state,
    speed: window.__game.race.player.vehicle.speed, fonts: document.fonts.status,
    audio: { ready: window.__game.audio.ready, mode: window.__game.audio.engineMode,
      state: window.__game.audio.context.state },
  }));
  assert.equal(proof.online, false);
  assert.equal(proof.state, 'race');
  assert.ok(proof.speed > 1);
  assert.equal(proof.fonts, 'loaded');
  assert.equal(proof.audio.mode, 'worklet');
  assert.equal(proof.audio.state, 'running');
  await page.screenshot({ path: resolve(output, 'preview-offline-race.png') });
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, 'preview-offline-proof.json'), JSON.stringify({ url: url.href, manifest, ...proof, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ ...proof, cachedFiles: manifest.length, errors }, null, 2));
} finally { await browser.close(); }
