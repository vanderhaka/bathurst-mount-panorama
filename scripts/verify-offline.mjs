#!/usr/bin/env node
// Two real frozen builds prove offline boot and startup-only worker replacement.
// Usage: node scripts/verify-offline.mjs artifacts/review/item-2.6
import { strict as assert } from 'node:assert';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { build } from 'vite';
import { chromium } from 'playwright';

const output = resolve(process.argv[2] ?? 'artifacts/review/item-2.6');
await mkdir(output, { recursive: true });
const versions = await mkdtemp(resolve(output, 'versions-'));
const directories = {};
for (const version of ['A', 'B']) {
  const outDir = resolve(versions, version);
  await build({ root: process.cwd(), logLevel: 'warn',
    plugins: [{ name: 'offline-verification-version', transformIndexHtml: () => [
      { tag: 'meta', attrs: { name: 'offline-proof-version', content: version } },
    ] }], build: { outDir, emptyOutDir: true } });
  directories[version] = outDir;
}

let serving = directories.A;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.woff': 'font/woff' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const file = resolve(serving, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(serving + sep)) { response.writeHead(403).end(); return; }
  try {
    const bytes = await readFile(file);
    response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await context.newPage();
const errors = [];
const observe = page => {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
};
observe(page);
const ready = async page => page.waitForFunction(() => window.__shotReady, null, { timeout: 90000 });
const snapshot = page => page.evaluate(async () => ({
  version: document.querySelector('meta[name="offline-proof-version"]').content,
  online: navigator.onLine, controlled: !!navigator.serviceWorker.controller,
  caches: await caches.keys(), state: window.__game.state,
  speed: window.__game.race?.player.vehicle.speed ?? null,
  audio: { ready: window.__game.audio?.ready, mode: window.__game.audio?.engineMode,
    state: window.__game.audio?.context?.state },
  fonts: document.fonts.status,
}));
const drive = async page => {
  await page.locator('.mn-screen--title .mn-btn--primary').tap();
  await page.waitForTimeout(500);
  await page.locator('[aria-label="Start time trial"]').tap();
  await page.waitForFunction(() => window.__game?.race?.session.lights < 0, null, { timeout: 30000 });
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction(() => window.__game.audio?.ready, null, { timeout: 10000 });
  assert.ok((await snapshot(page)).speed > 1);
};

try {
  await page.goto(url);
  await ready(page);
  await page.waitForFunction(async () => !!navigator.serviceWorker.controller &&
    (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 60000 });
  const initial = await snapshot(page);
  const manifest = await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('bathurst-game-'));
    return (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname);
  });
  assert.equal(manifest.filter(path => path.endsWith('.woff')).length, 4);
  assert.ok(manifest.some(path => path.includes('engine-processor-')));
  assert.ok(!manifest.some(path => path.startsWith('/harness/')));
  await page.evaluate(() => caches.open('unrelated-offline-proof'));
  await page.screenshot({ path: resolve(output, 'online-title.png') });

  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await drive(page);
  const offlineA = await snapshot(page);
  assert.equal(offlineA.version, 'A');
  assert.equal(offlineA.online, false);
  assert.equal(offlineA.audio.mode, 'worklet');
  assert.equal(offlineA.fonts, 'loaded');
  await page.screenshot({ path: resolve(output, 'offline-race.png') });
  await page.evaluate(async () => {
    const game = window.__game;
    game.settings.quality = 'high';
    game.settings.autoQuality = false;
    await game.graphics.applySettings(game.settings);
  });
  await page.screenshot({ path: resolve(output, 'offline-high.png') });

  await context.setOffline(false);
  serving = directories.B;
  await page.evaluate(async () => {
    window.__proofController = navigator.serviceWorker.controller;
    await (await navigator.serviceWorker.getRegistration()).update();
  });
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state === 'installed', null, { timeout: 60000 });
  assert.ok(await page.evaluate(() => window.__proofController === navigator.serviceWorker.controller && window.__game.state === 'race'));
  const waiting = await snapshot(page);
  assert.equal(waiting.version, 'A');
  assert.equal(waiting.caches.filter(name => name.startsWith('bathurst-game-')).length, 2);

  const other = await context.newPage();
  observe(other);
  await other.goto(url);
  await ready(other);
  const deferred = await other.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(deferred, true);
  assert.ok(await page.evaluate(() => window.__proofController === navigator.serviceWorker.controller && window.__game.state === 'race'));
  await other.close();

  let navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await page.reload();
  await ready(page);
  await page.waitForTimeout(500);
  const updated = await snapshot(page);
  assert.equal(updated.version, 'B');
  assert.equal(navigations, 2, 'one requested start and one controllerchange reload');
  const startupNavigations = navigations;
  assert.equal(updated.caches.filter(name => name.startsWith('bathurst-game-')).length, 1);
  assert.ok(updated.caches.includes('unrelated-offline-proof'));

  await context.setOffline(true);
  await page.reload();
  await ready(page);
  await drive(page);
  const offlineB = await snapshot(page);
  assert.equal(offlineB.version, 'B');
  assert.equal(offlineB.audio.mode, 'worklet');
  const cacheBytes = await page.evaluate(async () => {
    const name = (await caches.keys()).find(name => name.startsWith('bathurst-game-'));
    const cache = await caches.open(name);
    let bytes = 0;
    for (const request of await cache.keys()) bytes += (await (await cache.match(request)).arrayBuffer()).byteLength;
    return bytes;
  });
  await page.screenshot({ path: resolve(output, 'updated-offline-race.png') });
  assert.deepEqual(errors, []);
  const proof = { initial, manifest, offlineA, waiting, deferred, updated, offlineB,
    startupNavigations, totalNavigations: navigations, cacheBytes, errors,
    note: 'Real frozen builds differ only in a verification meta tag; no shipping source is modified.' };
  await writeFile(resolve(output, 'offline-proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
