#!/usr/bin/env node
// Headless screenshot tool for agents and verification.
// Usage: node scripts/shot.mjs --url <url> --out <file.png> [--size 1600x900]
//        [--timeout 90000] [--delay 500] [--eval "<js run in page before capture>"]
// Waits until the page sets window.__shotReady = true (falls back to timeout),
// prints console errors and window.__shotInfo (if set) as JSON.
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]]);
    return acc;
  }, []),
);
if (!args.url || !args.out) {
  console.error('Usage: node scripts/shot.mjs --url <url> --out <file.png> [--size WxH] [--timeout ms] [--delay ms] [--eval js]');
  process.exit(2);
}
const [width, height] = (args.size ?? '1600x900').split('x').map(Number);
const timeout = Number(args.timeout ?? 90000);
const delay = Number(args.delay ?? 300);

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(args.url, { waitUntil: 'load', timeout });
try {
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout, polling: 100 });
} catch {
  errors.push('[shot] timed out waiting for window.__shotReady');
}
if (args.eval) {
  const r = await page.evaluate(async (code) => { const f = new Function(`return (async () => { ${code} })()`); return f(); }, args.eval);
  if (r !== undefined) console.log('eval result:', JSON.stringify(r));
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout, polling: 100 }).catch(() => {});
}
await page.waitForTimeout(delay);
mkdirSync(dirname(args.out), { recursive: true });
await page.screenshot({ path: args.out });
const info = await page.evaluate(() => window.__shotInfo ?? null);
const gl = await page.evaluate(() => {
  const c = document.createElement('canvas').getContext('webgl2');
  const ext = c?.getExtension('WEBGL_debug_renderer_info');
  return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
});
console.log(JSON.stringify({ out: args.out, ms: Date.now() - t0, gpu: gl, info, errors: errors.slice(0, 30) }, null, 1));
await browser.close();
