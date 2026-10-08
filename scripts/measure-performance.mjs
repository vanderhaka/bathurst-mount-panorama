#!/usr/bin/env node
// Actual rendered frames and asynchronous GPU elapsed queries on a frozen preview.
// Usage: node scripts/measure-performance.mjs <out.json> [--url URL] [--mobile]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';

const args = process.argv.slice(2);
const out = args[0];
if (!out) throw new Error('Supply an output JSON path');
mkdirSync(dirname(out), { recursive: true });
const i = args.indexOf('--url');
const url = i >= 0 ? args[i + 1] : 'http://127.0.0.1:5181/';
const mobile = args.includes('--mobile');
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage(mobile
  ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
  : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const errors = [];
await authenticatePreview(page, url);
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Start time trial', exact: true }).click();
await page.waitForFunction(() => window.__game?.race?.session.lights < 0, null, { timeout: 30000 });

const result = { url, device: mobile ? 'Chrome phone emulation (not an iPhone)' : 'desktop Chrome', tiers: {}, errors };
const evidencePoints = await page.evaluate(() => window.__game.world.track.id === 'adelaide'
  ? [['pitStraight', 60], ['sennaChicane', 240], ['staircase', 840], ['turn8', 1790]]
  : [['pitStraight', 200], ['mountain', 1200], ['skyline', 3330], ['conrod', 4600]]);
for (const tier of mobile ? ['medium', 'low'] : ['high', 'medium', 'low']) {
  await page.evaluate(async tier => {
    const g = window.__game;
    g.settings.quality = tier;
    g.settings.frameRate = 0;
    g.settings.autoQuality = false;
    await g.graphics.applySettings(g.settings);
  }, tier);
  const points = {};
  for (const [name, s] of evidencePoints) {
    await page.evaluate(s => {
      const g = window.__game;
      g.state = 'race';
      g.debugTeleport(s);
      g.setDebugAutopilot(false);
      g.rig.snap();
    }, s);
    await page.waitForTimeout(800);
    await page.evaluate(() => { window.__game.state = 'paused'; });
    points[name] = await page.evaluate(() => new Promise(resolve => {
      const g = window.__game, stage = g.stage, r = stage.renderer;
      const gl = r.getContext(), ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const pending = [], samples = [], cpu = [];
      let frames = 0, calls = 0, triangles = 0;
      const original = stage.render.bind(stage);
      const start = performance.now();
      const autoReset = r.info.autoReset;
      r.info.autoReset = false;
      stage.render = focus => {
        r.info.reset();
        const query = ext && frames % 6 === 0 ? gl.createQuery() : null;
        if (query) gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        const t = performance.now();
        original(focus);
        cpu.push(performance.now() - t);
        if (query) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(query); }
        frames++;
        calls = Math.max(calls, r.info.render.calls);
        triangles = Math.max(triangles, r.info.render.triangles);
      };
      const poll = () => {
        for (let i = pending.length - 1; i >= 0; i--) {
          const q = pending[i];
          if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) samples.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q); pending.splice(i, 1);
        }
        if (performance.now() - start < 3500) { requestAnimationFrame(poll); return; }
        const durationMs = performance.now() - start;
        stage.render = original;
        r.info.autoReset = autoReset;
        for (const q of pending) gl.deleteQuery(q);
        const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
        resolve({ fps: Math.round(frames * 1000 / durationMs), measuredFps: frames * 1000 / durationMs,
          frames, durationMs, gpuMs: mean(samples), gpuSamples: samples.length,
          gpuStatus: samples.length ? 'measured' : 'timer query unavailable', cpuRenderMs: mean(cpu),
          calls, triangles, textures: r.info.memory.textures, geometries: r.info.memory.geometries,
          pixelRatio: r.getPixelRatio(), gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'unknown' });
      };
      requestAnimationFrame(poll);
    }));
    await page.screenshot({ path: `${dirname(out)}/${mobile ? 'phone' : 'desktop'}-${tier}-${name}.png` });
  }
  result.tiers[tier] = points;
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
await browser.close();
if (errors.length) process.exitCode = 1;
