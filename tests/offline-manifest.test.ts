import { describe, expect, it } from 'vitest';
import { buildCacheManifest, type EmittedFile } from '../build/offline-manifest';

const metadata = (css: string[] = [], assets: string[] = []) => ({ importedCss: new Set(css), importedAssets: new Set(assets) });
function fixture(): Record<string, EmittedFile> {
  return {
    'index.html': { type: 'asset', fileName: 'index.html', source: '<script src="/assets/main-111.js"></script>' },
    'assets/main-111.js': { type: 'chunk', fileName: 'assets/main-111.js', isEntry: true, facadeModuleId: '/game/index.html', code: 'start()', imports: ['assets/shared-222.js'], dynamicImports: ['assets/high-333.js'], viteMetadata: metadata(['assets/game-444.css'], ['assets/engine-777.js']) },
    'assets/shared-222.js': { type: 'chunk', fileName: 'assets/shared-222.js', code: 'shared()', imports: [], dynamicImports: [], viteMetadata: metadata() },
    'assets/high-333.js': { type: 'chunk', fileName: 'assets/high-333.js', code: 'high()', imports: ['assets/shared-222.js'], dynamicImports: [], viteMetadata: metadata() },
    'assets/game-444.css': { type: 'asset', fileName: 'assets/game-444.css', source: '@font-face{}', viteMetadata: metadata([], ['assets/font-555.woff2']) },
    'assets/engine-777.js': { type: 'asset', fileName: 'assets/engine-777.js', source: 'audioWorkletProcessor()' },
    'assets/font-555.woff2': { type: 'asset', fileName: 'assets/font-555.woff2', source: new Uint8Array([1, 2, 3]) },
    'harness/cars.html': { type: 'asset', fileName: 'harness/cars.html', source: 'debug' },
    'assets/cars-666.js': { type: 'chunk', fileName: 'assets/cars-666.js', isEntry: true, facadeModuleId: '/game/harness/cars.html', code: 'debug()', imports: ['assets/shared-222.js'], dynamicImports: [], viteMetadata: metadata() },
  };
}
const publicFiles = { 'manifest.webmanifest': '{}', 'icon-180.png': new Uint8Array([4]), 'icon-512.png': new Uint8Array([5]) };

describe('emitted offline manifest', () => {
  it('caches the root page and actual static/lazy game dependencies, CSS, fonts and app icons', () => {
    const manifest = buildCacheManifest(fixture(), publicFiles, '/', 'worker-v1');
    expect(manifest.files).toEqual([
      '/', '/assets/engine-777.js', '/assets/font-555.woff2', '/assets/game-444.css', '/assets/high-333.js',
      '/assets/main-111.js', '/assets/shared-222.js', '/icon-180.png', '/icon-512.png',
      '/index.html', '/manifest.webmanifest',
    ]);
    expect(manifest.cacheName).toMatch(/^bathurst-game-[a-f0-9]{20}$/);
  });

  it('keeps harness/HMR files out, and makes a deterministic version from content', () => {
    const a = buildCacheManifest(fixture(), publicFiles, '/', 'worker-v1');
    const reversed = Object.fromEntries(Object.entries(fixture()).reverse());
    const b = buildCacheManifest(reversed, publicFiles, '/', 'worker-v1');
    expect(b).toEqual(a);
    expect(a.files.some((p) => p.includes('harness') || p.includes('666') || p.includes('@vite'))).toBe(false);
    const changed = fixture();
    changed['index.html'].source = 'new page with the same name';
    expect(buildCacheManifest(changed, publicFiles, '/', 'worker-v1').cacheName).not.toBe(a.cacheName);
    expect(buildCacheManifest(fixture(), publicFiles, '/', 'worker-v2').cacheName).not.toBe(a.cacheName);
    expect(buildCacheManifest(fixture(), { ...publicFiles, 'icon-180.png': new Uint8Array([9]) }, '/', 'worker-v1').cacheName).not.toBe(a.cacheName);
  });

  it('fails a build with a missing dependency rather than emitting an incomplete offline cache', () => {
    const files = fixture();
    delete files['assets/high-333.js'];
    expect(() => buildCacheManifest(files, publicFiles, '/', 'worker')).toThrow(/high-333/);
  });

  it('uses the configured base for worker scope and emitted URLs', () => {
    const manifest = buildCacheManifest(fixture(), publicFiles, '/bathurst/', 'worker');
    expect(manifest.rootPath).toBe('/bathurst/');
    expect(manifest.files).toContain('/bathurst/index.html');
    expect(manifest.files).toContain('/bathurst/assets/font-555.woff2');
  });
});
