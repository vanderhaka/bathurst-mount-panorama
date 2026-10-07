#!/usr/bin/env node
// Counts actual first-load transfers and estimated live WebGL allocation bytes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { authenticatePreview } from './browser-auth.mjs';

const args = process.argv.slice(2), out = args[0];
if (!out) throw new Error('Supply an output JSON path');
const i = args.indexOf('--url'), url = i < 0 ? 'http://127.0.0.1:5181/' : args[i + 1];
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 },
  isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
await authenticatePreview(page, url);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => {
  const allocations = new Map(), bindings = new Map();
  let unit = 0, rb = null;
  const proto = WebGL2RenderingContext.prototype;
  const wrap = (name, before) => {
    const original = proto[name];
    proto[name] = function (...a) { before(this, a); return original.apply(this, a); };
  };
  const bpp = (g, format, type) => {
    if ([g.RGBA16F, g.RGBA16].includes(format)) return 8;
    if (format === g.RGBA32F) return 16;
    if (format === g.R16F) return 2;
    if (format === g.RG16F) return 4;
    if ([g.DEPTH_COMPONENT24, g.DEPTH_COMPONENT32F, g.DEPTH24_STENCIL8].includes(format)) return 4;
    if (format === g.DEPTH_COMPONENT16) return 2;
    if (format === g.R8) return 1;
    if (format === g.RG8) return 2;
    if ([g.RGBA8, g.SRGB8_ALPHA8].includes(format)) return 4;
    const channels = format === g.RED ? 1 : format === g.RG ? 2 : format === g.RGB ? 3 : 4;
    return channels * (type === g.FLOAT ? 4 : [g.HALF_FLOAT, g.UNSIGNED_SHORT].includes(type) ? 2 : 1);
  };
  const texture = (g, target) => bindings.get(`${unit}:${target >= g.TEXTURE_CUBE_MAP_POSITIVE_X && target <= g.TEXTURE_CUBE_MAP_NEGATIVE_Z ? g.TEXTURE_CUBE_MAP : target}`);
  const put = (object, level, bytes) => {
    if (!object) return;
    if (!allocations.has(object)) allocations.set(object, new Map());
    allocations.get(object).set(level, bytes);
  };
  wrap('activeTexture', (g, a) => { unit = a[0] - g.TEXTURE0; });
  wrap('bindTexture', (_g, a) => bindings.set(`${unit}:${a[0]}`, a[1]));
  wrap('texImage2D', (g, a) => {
    const source = a[a.length - 1], sized = a.length >= 9;
    const width = sized ? a[3] : source.width, height = sized ? a[4] : source.height;
    put(texture(g, a[0]), `${a[0]}:${a[1]}`, width * height * bpp(g, a[2], sized ? a[7] : a[4]));
  });
  wrap('texStorage2D', (g, a) => {
    const faces = a[0] === g.TEXTURE_CUBE_MAP ? 6 : 1;
    for (let level = 0; level < a[1]; level++) put(texture(g, a[0]), `storage:${level}`,
      Math.max(1, a[3] >> level) * Math.max(1, a[4] >> level) * bpp(g, a[2]) * faces);
  });
  wrap('generateMipmap', (g, a) => {
    const object = texture(g, a[0]), levels = allocations.get(object);
    if (levels) {
      const base = [...levels].filter(([key]) => key.endsWith(':0')).reduce((n, [, bytes]) => n + bytes, 0);
      if (base) put(object, 'generated-mips-estimate', base / 3);
    }
  });
  wrap('deleteTexture', (_g, a) => allocations.delete(a[0]));
  wrap('bindRenderbuffer', (_g, a) => { rb = a[1]; });
  wrap('renderbufferStorage', (g, a) => put(rb, 'buffer', a[2] * a[3] * bpp(g, a[1])));
  wrap('renderbufferStorageMultisample', (g, a) => put(rb, 'buffer', Math.max(1, a[1]) * a[3] * a[4] * bpp(g, a[2])));
  wrap('deleteRenderbuffer', (_g, a) => allocations.delete(a[0]));
  window.__allocationBytes = () => [...allocations.values()].reduce((n, levels) => n + [...levels.values()].reduce((s, b) => s + b, 0), 0);
});
await page.goto(url);
await page.waitForFunction(() => window.__shotReady, null, { timeout: 120000 });
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Start time trial', exact: true }).click();
await page.waitForFunction(() => window.__game?.race?.session.lights < 0, null, { timeout: 30000 });
await page.waitForTimeout(1000);
const result = await page.evaluate(() => {
  const resources = [performance.getEntriesByType('navigation')[0], ...performance.getEntriesByType('resource')]
    .filter(e => e && e.name.startsWith(location.origin)).map(e => ({ url: e.name, transferred: e.transferSize, encoded: e.encodedBodySize }));
  const r = window.__game.stage.renderer;
  return { quality: window.__game.settings.quality, resources,
    transferredBytes: resources.reduce((n, e) => n + e.transferred, 0), encodedBytes: resources.reduce((n, e) => n + e.encoded, 0),
    estimatedGpuBytes: window.__allocationBytes(), pixelRatio: r.getPixelRatio(), textures: r.info.memory.textures };
});
result.url = url;
result.errors = errors;
result.method = 'Live texImage2D/texStorage2D/renderbuffer allocations, deletion and generated mip chains. Estimate excludes driver overhead and default framebuffer; depth24 counts 4 bytes/pixel. Chrome emulation on this Mac, not real phone VRAM.';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, resources: result.resources.length }));
await browser.close();
if (errors.length || !Number.isFinite(result.estimatedGpuBytes)) process.exitCode = 1;
