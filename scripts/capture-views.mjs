#!/usr/bin/env node
// Fixed driving-distance views for tone mapping and subsequent realism rounds.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';
const args = process.argv.slice(2), out = args[0];
const opt = (key, fallback) => { const i = args.indexOf(`--${key}`); return i < 0 ? fallback : args[i + 1]; };
const url = opt('url', 'http://127.0.0.1:5181/'), tones = opt('tones', 'default').split(',');
if (!out) throw new Error('Supply an output directory');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await authenticatePreview(page, url);
const errors = [], captures = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
const corners = [['10-hell-corner', 380], ['11-mountain-straight', 1000], ['12-griffins-bend', 1500],
  ['13-the-cutting', 1990], ['14-reid-park', 2330], ['15-mcphillamy-park', 2990], ['16-skyline', 3330],
  ['17-the-dipper', 3560], ['18-forrests-elbow', 3900], ['19-conrod-straight', 4500],
  ['20-the-chase', 5480], ['21-murrays-corner', 6060]];
for (const tone of tones) {
  await page.goto(url);
  await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
  await page.waitForTimeout(3500);
  await page.keyboard.press('Enter'); await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(1500);
  await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1200);
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
  await page.waitForTimeout(2600);
  await page.waitForFunction(() => window.__game.race.session.lights < 0, null, { timeout: 30000 });
  await page.evaluate(() => { window.__game.settings.showFps = true; window.__game.setDebugAutopilot(true); });
  if (tone !== 'default') await page.evaluate(tone => {
    const map = { ACES: 4, AgX: 6, Neutral: 7 };
    // The post material uses the renderer's public toneMapping state.
    window.__game.stage.renderer.toneMapping = map[tone];
  }, tone);
  for (const [view, s] of corners) {
    await page.evaluate(s => window.__game.debugTeleport(s), s); await page.waitForTimeout(1700);
    const name = `${out}/${tone === 'default' ? '' : `${tone}-`}${view}.png`;
    await page.screenshot({ path: name }); captures.push({ tone, view, path: name });
  }
}
writeFileSync(`${out}/views.json`, JSON.stringify({ url, tones, captures, errors }, null, 2));
await browser.close();
if (errors.length) { console.error(JSON.stringify(errors)); process.exitCode = 1; }
else console.log(JSON.stringify({ captures: captures.length, errors: [] }));
